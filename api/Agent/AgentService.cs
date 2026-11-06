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

    public sealed record PitchDraft(string Greeting, string Intro, List<PitchProject> Projects, List<string> Highlights, string Closing);

    // Recruiter mode draft: Sonnet, JSON out. Admin-only, so no rate limit; still billed in the usage log.
    public async Task<PitchDraft> PitchDraftAsync(string company, string role, string notes, CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var ask = $"Företag: {company}\nRoll: {(string.IsNullOrWhiteSpace(role) ? "(ej angiven)" : role)}\n\nHavals anteckningar:\n{(string.IsNullOrWhiteSpace(notes) ? "(inga)" : notes)}";
        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 2500,
            OutputConfig = new OutputConfig { Effort = Effort.Medium },
            System = new List<TextBlockParam> { new() { Text = Prompts.Pitch(site), CacheControl = new CacheControlEphemeral() } },
            Messages = [new UserMessageParam { Content = ask }],
        }, cancellationToken: ct);
        await guard.RecordAsync("pitch", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);

        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException("Draft was not JSON");
        var json = System.Text.Json.JsonDocument.Parse(text[start..(end + 1)]).RootElement;
        var known = site.Projects.Select(p => p.Slug).ToHashSet();
        return new PitchDraft(
            Str(json, "greeting"),
            Str(json, "intro"),
            json.TryGetProperty("projects", out var ps) && ps.ValueKind == System.Text.Json.JsonValueKind.Array
                ? ps.EnumerateArray().Select(p => new PitchProject(Str(p, "slug"), Str(p, "why"))).Where(p => known.Contains(p.Slug)).ToList()
                : [],
            json.TryGetProperty("highlights", out var hs) && hs.ValueKind == System.Text.Json.JsonValueKind.Array
                ? hs.EnumerateArray().Select(h => h.GetString() ?? "").Where(h => h.Length > 0).ToList()
                : [],
            Str(json, "closing"));

        static string Str(System.Text.Json.JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() ?? "" : "";
    }

    // Streams text deltas; the final Usage is reported through the callback after the stream ends.
    // Eco mode (past the daily eco threshold) swaps to Sonnet with a shorter prototype. A deadline
    // (AGENT_BUILD_DEADLINE_SEC) ends the stream early and marks the build truncated.
    public async IAsyncEnumerable<string> BuildStreamAsync(
        string idea,
        bool eco,
        Action<Usage> onDone,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var started = System.Diagnostics.Stopwatch.StartNew();
        var site = await content.GetAsync(ct);
        long inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0, streamedChars = 0;
        var truncated = false;
        var requested = eco ? guard.EcoBuildModel : guard.BuildModel;
        var model = requested;

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (guard.BuildDeadlineSeconds > 0)
            deadline.CancelAfter(TimeSpan.FromSeconds(guard.BuildDeadlineSeconds) - started.Elapsed);

        // Output includes the model's thinking, so a full prototype + plan lands around 5-7K tokens.
        var stream = client.Messages.CreateStreaming(new MessageCreateParams
        {
            Model = requested,
            MaxTokens = eco ? guard.EcoBuildMaxTokens : guard.BuildMaxTokens,
            OutputConfig = new OutputConfig
            {
                Effort = eco ? Effort.Low : guard.BuildEffort switch { "low" => Effort.Low, "high" => Effort.High, _ => Effort.Medium },
            },
            System = new List<TextBlockParam> { new() { Text = Prompts.Build(site, eco), CacheControl = new CacheControlEphemeral() } },
            Messages = [new UserMessageParam { Content = $"Idé: {idea}" }],
        }, cancellationToken: deadline.Token);

        await using var events = stream.GetAsyncEnumerator(deadline.Token);
        while (true)
        {
            string? text = null;
            try
            {
                if (!await events.MoveNextAsync()) break;
                var ev = events.Current;
                if (ev.TryPickStart(out var start))
                {
                    model = start.Message.Model.ToString()?.Trim('"') ?? requested;
                    inputTokens = start.Message.Usage.InputTokens;
                    cacheRead = start.Message.Usage.CacheReadInputTokens ?? 0;
                    cacheWrite = start.Message.Usage.CacheCreationInputTokens ?? 0;
                }
                else if (ev.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var t))
                {
                    text = t.Text;
                    streamedChars += text.Length;
                }
                else if (ev.TryPickDelta(out var msgDelta))
                {
                    outputTokens = msgDelta.Usage.OutputTokens;
                    truncated = msgDelta.Delta.StopReason == "max_tokens";
                }
            }
            catch (OperationCanceledException) when (deadline.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                // Deadline hit: keep what was streamed, estimate the output tokens for the bill.
                truncated = true;
                log.LogWarning("Build Lab run hit the {Seconds}s deadline after {Chars} chars", guard.BuildDeadlineSeconds, streamedChars);
                break;
            }
            if (text is not null) yield return text;
        }
        if (outputTokens == 0 && streamedChars > 0) outputTokens = streamedChars / 3; // conservative estimate

        var usd = await guard.RecordAsync("build", model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated, CancellationToken.None);
        log.LogInformation("Build Lab run: {Model} in={In} out={Out} cacheRead={CacheRead} cacheWrite={CacheWrite} truncated={Truncated} cost={Usd:F4} USD in {Elapsed:F1}s",
            model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated, usd, started.Elapsed.TotalSeconds);
        onDone(new Usage(model, inputTokens, outputTokens, cacheRead, cacheWrite, truncated));
    }
}
