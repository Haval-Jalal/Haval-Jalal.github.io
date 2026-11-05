using Anthropic;
using Anthropic.Models.Messages;
using HavalApi.Data;
using Microsoft.Extensions.Logging;

namespace HavalApi.Agent;

public sealed record ChatTurn(string Role, string Text);
public sealed record ChatReply(string Text, string Model, long InputTokens, long OutputTokens, bool Refused);
public sealed record Usage(string Model, long InputTokens, long OutputTokens, long CacheReadTokens);

// Thin wrapper over the Anthropic SDK: one method per feature, prompts from Prompts.cs,
// usage reported to AgentGuard so the daily cap reflects real spend.
public sealed class AgentService(AnthropicClient client, IContentStore content, AgentGuard guard, ILogger<AgentService> log)
{
    public const string ChatModel = "claude-sonnet-5-5";
    public const string BuildModel = "claude-opus-5-5";

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

        await guard.RecordAsync("chat", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, response.Usage.CacheReadInputTokens ?? 0, ct);

        if (response.StopReason == "refusal")
            return new ChatReply("Den frågan kan jag tyvärr inte svara på här. Hör gärna av dig till Haval direkt.", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, true);

        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        return new ChatReply(text, ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, false);
    }

    // Streams text deltas; the final Usage is reported through the callback after the stream ends.
    public async IAsyncEnumerable<string> BuildStreamAsync(
        string idea,
        Action<Usage> onDone,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        long inputTokens = 0, outputTokens = 0, cacheRead = 0;
        var model = BuildModel;

        var stream = client.Messages.CreateStreaming(new MessageCreateParams
        {
            Model = BuildModel,
            MaxTokens = 6000,
            OutputConfig = new OutputConfig { Effort = Effort.Medium },
            System = new List<TextBlockParam> { new() { Text = Prompts.Build(site), CacheControl = new CacheControlEphemeral() } },
            Messages = [new UserMessageParam { Content = $"Idé: {idea}" }],
        }, cancellationToken: ct);

        await foreach (var ev in stream.WithCancellation(ct))
        {
            if (ev.TryPickStart(out var start))
            {
                model = start.Message.Model.ToString()?.Trim('"') ?? BuildModel;
                inputTokens = start.Message.Usage.InputTokens;
                cacheRead = start.Message.Usage.CacheReadInputTokens ?? 0;
            }
            else if (ev.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text))
            {
                yield return text.Text;
            }
            else if (ev.TryPickDelta(out var msgDelta))
            {
                outputTokens = msgDelta.Usage.OutputTokens;
            }
        }

        var usd = await guard.RecordAsync("build", model, inputTokens, outputTokens, cacheRead, CancellationToken.None);
        log.LogInformation("Build Lab run: {Model} in={In} out={Out} cache={Cache} cost={Usd:F4} USD", model, inputTokens, outputTokens, cacheRead, usd);
        onDone(new Usage(model, inputTokens, outputTokens, cacheRead));
    }
}
