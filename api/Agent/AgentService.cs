using Anthropic;
using Anthropic.Models.Messages;
using HavalApi.Data;
using Microsoft.Extensions.Logging;

namespace HavalApi.Agent;

public sealed record ChatTurn(string Role, string Text);
public sealed record ChatReply(string Text, string Model, long InputTokens, long OutputTokens, bool Refused);
public sealed record Usage(string Model, long InputTokens, long OutputTokens, long CacheReadTokens, long CacheWriteTokens, bool Truncated);

// Thin wrapper over the Anthropic SDK: one method per feature, prompts from Prompts.cs,
// usage reported to AgentGuard so the daily cap reflects real spend.
public sealed class AgentService(AnthropicClient client, IContentStore content, AgentGuard guard, ILogger<AgentService> log)
{
    public const string ChatModel = "claude-sonnet-5-5";
    public const string BuildModel = "claude-opus-5-5";
    public const string EcoBuildModel = "claude-sonnet-5-5";

    public async Task<ChatReply> ChatAsync(IReadOnlyList<ChatTurn> turns, CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var messages = turns
            .TakeLast(12)
            .Select<ChatTurn, MessageParam>(t => t.Role == "assistant"
                ? new AssistantMessageParam { Content = t.Text }
                : new UserMessageParam { Content = t.Text })
            .ToList();

        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 1024,
            OutputConfig = new OutputConfig { Effort = Effort.Low },
            System = new List<TextBlockParam> { new() { Text = Prompts.Chat(site), CacheControl = new CacheControlEphemeral() } },
            Messages = messages,
        }, cancellationToken: ct);

        await guard.RecordAsync("chat", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);

        if (response.StopReason == "refusal")
            return new ChatReply("Den frågan kan jag tyvärr inte svara på här. Hör gärna av dig till Haval direkt.", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, true);

        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        return new ChatReply(text, ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, false);
    }

    // Streams text deltas; the final Usage is reported through the callback after the stream ends.
    // Eco mode (past the daily eco threshold) swaps to Sonnet with a shorter prototype.
    public async IAsyncEnumerable<string> BuildStreamAsync(
        string idea,
        bool eco,
        Action<Usage> onDone,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        long inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0;
        var truncated = false;
        var requested = eco ? EcoBuildModel : BuildModel;
        var model = requested;

        // Output includes the model's thinking, so a full prototype + plan lands around 5-7K tokens.
        var stream = client.Messages.CreateStreaming(new MessageCreateParams
        {
            Model = requested,
            MaxTokens = eco ? 4500 : 8000,
            OutputConfig = new OutputConfig
            {
                Effort = eco ? Effort.Low : guard.BuildEffort switch { "low" => Effort.Low, "high" => Effort.High, _ => Effort.Medium },
            },
            System = new List<TextBlockParam> { new() { Text = Prompts.Build(site, eco), CacheControl = new CacheControlEphemeral() } },
            Messages = [new UserMessageParam { Content = $"Idé: {idea}" }],
        }, cancellationToken: ct);

        await foreach (var ev in stream.WithCancellation(ct))
        {
            if (ev.TryPickStart(out var start))
            {
                model = start.Message.Model.ToString()?.Trim('"') ?? requested;
                inputTokens = start.Message.Usage.InputTokens;
                cacheRead = start.Message.Usage.CacheReadInputTokens ?? 0;
                cacheWrite = start.Message.Usage.CacheCreationInputTokens ?? 0;
            }
            else if (ev.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text))
            {
                yield return text.Text;
            }
            else if (ev.TryPickDelta(out var msgDelta))
            {
                outputTokens = msgDelta.Usage.OutputTokens;
                truncated = msgDelta.Delta.StopReason == "max_tokens";
            }
        }

        var usd = await guard.RecordAsync("build", model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated, CancellationToken.None);
        log.LogInformation("Build Lab run: {Model} in={In} out={Out} cacheRead={CacheRead} cacheWrite={CacheWrite} truncated={Truncated} cost={Usd:F4} USD",
            model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated, usd);
        onDone(new Usage(model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated));
    }
}
