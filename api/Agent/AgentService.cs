using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using HavalApi.Data;
using Microsoft.Extensions.Logging;

namespace HavalApi.Agent;

public sealed record ChatTurn(string Role, string Text);
public sealed record AgentAction(string Type, Dictionary<string, string> Args);
public sealed record ChatReply(string Text, string Model, long InputTokens, long OutputTokens, bool Refused, List<AgentAction> Actions);
public sealed record Usage(string Model, long InputTokens, long OutputTokens, long CacheReadTokens, long CacheWriteTokens, bool Truncated);

// Thin wrapper over the Anthropic SDK: one method per feature, prompts from Prompts.cs,
// usage reported to AgentGuard so the daily cap reflects real spend.
public sealed class AgentService(AnthropicClient client, IContentStore content, IPostStore posts, IAgentStore agentStore, AgentGuard guard, ILogger<AgentService> log)
{
    public const string ChatModel = "claude-sonnet-5-5";

    private static readonly string[] Sections = ["projekt", "resan", "stack", "lekplats", "build-lab", "kontakt"];

    // The page executes these; Javal never waits for a result. log_unanswered runs here instead.
    private static List<ToolUnion> ChatTools(IEnumerable<string> slugs) =>
    [
        new Tool
        {
            Name = "show_project",
            Description = "Scroll the page to one of Haval's projects and highlight it.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement> { ["slug"] = JsonSerializer.SerializeToElement(new { type = "string", @enum = slugs.ToArray() }) },
                Required = ["slug"],
            },
        },
        new Tool
        {
            Name = "open_section",
            Description = "Scroll the page to a section of the site.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement> { ["section"] = JsonSerializer.SerializeToElement(new { type = "string", @enum = Sections }) },
                Required = ["section"],
            },
        },
        new Tool
        {
            Name = "prefill_build_lab",
            Description = "Open the Build Lab with the visitor's idea already typed in, ready to build.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement> { ["idea"] = JsonSerializer.SerializeToElement(new { type = "string", description = "The idea in the visitor's own words, one or two sentences" }) },
                Required = ["idea"],
            },
        },
        new Tool
        {
            Name = "open_contact",
            Description = "Open the contact form with a short draft message to Haval already typed in.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement> { ["message"] = JsonSerializer.SerializeToElement(new { type = "string", description = "A short draft in the visitor's language that they can edit before sending" }) },
                Required = ["message"],
            },
        },
        new Tool
        {
            Name = "offer_cv",
            Description = "Show a button that downloads Haval's CV as PDF.",
            InputSchema = new() { Properties = new Dictionary<string, JsonElement>(), Required = [] },
        },
        new Tool
        {
            Name = "log_unanswered",
            Description = "Record a real question about Haval that the material could not answer, so Haval can add the fact. Never for greetings or small talk.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["question"] = JsonSerializer.SerializeToElement(new { type = "string", description = "The visitor's question, as asked" }),
                    ["topic"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Two or three words naming the topic, e.g. salary expectations, notice period, languages" }),
                },
                Required = ["question", "topic"],
            },
        },
    ];

    public async Task<ChatReply> ChatAsync(IReadOnlyList<ChatTurn> turns, string lang, CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var config = await agentStore.GetConfigAsync(ct);
        NowPage? now = null;
        List<ChangelogEntry> changelog = [];
        try
        {
            now = await posts.GetNowAsync("sv", ct);
            changelog = await posts.ListChangelogAsync(publishedOnly: true, ct);
        }
        catch (Exception e)
        {
            log.LogWarning(e, "Javal continues without the Nu page / changelog");
        }

        var slugs = site.Projects.Where(p => !p.Hidden).Select(p => p.Slug).ToList();
        var tools = ChatTools(slugs);
        var system = new List<TextBlockParam> { new() { Text = Prompts.Chat(site, lang, config, now, changelog), CacheControl = new CacheControlEphemeral() } };
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
            System = system,
            Tools = tools,
            Messages = messages,
        }, cancellationToken: ct);
        await RecordAsync(response, ct);

        if (response.StopReason == "refusal")
            return new ChatReply("Den frågan kan jag tyvärr inte svara på här. Hör gärna av dig till Haval direkt.", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, true, []);

        var actions = new List<AgentAction>();
        var text = await CollectAsync(response, slugs, lang, actions, ct);

        // The model sometimes stops after a tool call and saves its words for the next turn. Give it the
        // results it expects ("done") and let it finish the sentence; one extra round at most.
        if (string.IsNullOrWhiteSpace(text) && response.StopReason == "tool_use")
        {
            List<ContentBlockParam> echo = [];
            List<ContentBlockParam> results = [];
            foreach (var block in response.Content)
            {
                if (block.TryPickText(out TextBlock? tb)) echo.Add(new TextBlockParam { Text = tb.Text });
                else if (block.TryPickThinking(out ThinkingBlock? th)) echo.Add(new ThinkingBlockParam { Thinking = th.Thinking, Signature = th.Signature });
                else if (block.TryPickRedactedThinking(out RedactedThinkingBlock? rt)) echo.Add(new RedactedThinkingBlockParam { Data = rt.Data });
                else if (block.TryPickToolUse(out ToolUseBlock? tu))
                {
                    echo.Add(new ToolUseBlockParam { ID = tu.ID, Name = tu.Name, Input = tu.Input });
                    results.Add(new ToolResultBlockParam { ToolUseID = tu.ID, Content = "done" });
                }
            }
            if (results.Count > 0)
            {
                messages.Add(new AssistantMessageParam { Content = echo });
                messages.Add(new UserMessageParam { Content = results });
                var second = await client.Messages.Create(new MessageCreateParams
                {
                    Model = ChatModel,
                    MaxTokens = 1024,
                    OutputConfig = new OutputConfig { Effort = Effort.Low },
                    System = system,
                    Tools = tools,
                    Messages = messages,
                }, cancellationToken: ct);
                await RecordAsync(second, ct);
                text = await CollectAsync(second, slugs, lang, actions, ct);
            }
        }

        return new ChatReply(text, ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens, false, actions);
    }

    private Task RecordAsync(Message response, CancellationToken ct) =>
        guard.RecordAsync("chat", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);

    // Text out, page actions validated and collected, the unanswered-question log written here.
    private async Task<string> CollectAsync(Message response, List<string> slugs, string lang, List<AgentAction> actions, CancellationToken ct)
    {
        var text = new System.Text.StringBuilder();
        foreach (var block in response.Content)
        {
            if (block.TryPickText(out TextBlock? tb)) { text.Append(tb.Text); continue; }
            if (!block.TryPickToolUse(out ToolUseBlock? tu)) continue;
            var input = JsonSerializer.SerializeToElement(tu.Input);
            string Arg(string name, int max) =>
                input.ValueKind == JsonValueKind.Object && input.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
                    ? (v.GetString() ?? "").Trim() is var s && s.Length > max ? s[..max] : s
                    : "";
            switch (tu.Name)
            {
                case "show_project" when slugs.Contains(Arg("slug", 80)):
                    actions.Add(new("show_project", new() { ["slug"] = Arg("slug", 80) }));
                    break;
                case "open_section" when Sections.Contains(Arg("section", 40)):
                    actions.Add(new("open_section", new() { ["section"] = Arg("section", 40) }));
                    break;
                case "prefill_build_lab" when Arg("idea", 600).Length > 3:
                    actions.Add(new("prefill_build_lab", new() { ["idea"] = Arg("idea", 600) }));
                    break;
                case "open_contact":
                    actions.Add(new("open_contact", new() { ["message"] = Arg("message", 800) }));
                    break;
                case "offer_cv":
                    actions.Add(new("offer_cv", new()));
                    break;
                case "log_unanswered" when Arg("question", 300).Length > 3:
                    try
                    {
                        await agentStore.AddQuestionAsync(new UnansweredQuestion(Guid.NewGuid().ToString("n"), DateTime.UtcNow, lang, Arg("question", 300), Arg("topic", 60)), ct);
                    }
                    catch (Exception e)
                    {
                        log.LogWarning(e, "Could not log an unanswered question");
                    }
                    break;
            }
        }
        if (actions.Count > 2) actions.RemoveRange(2, actions.Count - 2);
        return text.ToString().Trim();
    }

    // Translates every human-readable string of the content document; structure, keys, slugs,
    // links, tags, years, images and settings stay exactly as they are.
    public async Task<SiteContent> TranslateAsync(SiteContent source, string lang, CancellationToken ct)
    {
        var language = lang == "en" ? "English" : lang;
        var json = System.Text.Json.JsonSerializer.Serialize(source, JsonFileContentStore.Json);
        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 16000,
            OutputConfig = new OutputConfig { Effort = Effort.Low },
            System = new List<TextBlockParam> { new() { Text = $$"""
                You translate the content document of Haval Jalal's portfolio site from Swedish to {{language}}.
                Return ONLY the translated JSON document (no code fences, no commentary), with exactly the same structure
                and keys. Translate every human-readable string: profile texts, headline, project titles only if they are
                generic words (keep product names), taglines, summaries, highlights, journey/education texts, skill group
                titles, nav labels. Keep unchanged: slugs, URLs, e-mail addresses, hrefs, tags/technology names, years,
                periods, image paths, status codes, settings, dates. Keep the tone: warm, concrete, professional, first
                person where the source is first person. Use natural {{language}}, not word-for-word.
                """ } },
            Messages = [new UserMessageParam { Content = json }],
        }, cancellationToken: ct);
        await guard.RecordAsync("translate", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);
        if (response.StopReason == "max_tokens") throw new InvalidOperationException("Translation was cut off");

        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException("Translation was not JSON");
        return System.Text.Json.JsonSerializer.Deserialize<SiteContent>(text[start..(end + 1)], JsonFileContentStore.Json)
               ?? throw new InvalidOperationException("Translation was empty");
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

    // Admin writing help: rewrites one text field according to an instruction. Plain text in, plain text out.
    public async Task<string> DraftTextAsync(string instruction, string text, string context, string lang, CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var language = lang == "en" ? "English" : "Swedish";
        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 1500,
            OutputConfig = new OutputConfig { Effort = Effort.Medium },
            System = new List<TextBlockParam> { new() { Text = Prompts.Draft(site, language) } },
            Messages = [new UserMessageParam { Content = $"Field: {context}\nInstruction: {instruction}\n\nCurrent text:\n{(string.IsNullOrWhiteSpace(text) ? "(empty)" : text)}" }],
        }, cancellationToken: ct);
        await guard.RecordAsync("draft", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);
        return string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text)).Trim();
    }

    public sealed record ChangelogDraft(string Title, string Text, string TitleEn, string TextEn, List<string> Tags);

    // Turns a list of commit messages into one visitor-friendly changelog entry in both languages.
    public async Task<ChangelogDraft> ChangelogDraftAsync(IReadOnlyList<string> commits, string hint, CancellationToken ct)
    {
        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 1500,
            OutputConfig = new OutputConfig { Effort = Effort.Medium },
            System = new List<TextBlockParam> { new() { Text = Prompts.Changelog() } },
            Messages = [new UserMessageParam { Content = $"Haval's note: {(string.IsNullOrWhiteSpace(hint) ? "(none)" : hint)}\n\nCommits (newest first):\n- {string.Join("\n- ", commits)}" }],
        }, cancellationToken: ct);
        await guard.RecordAsync("draft", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);
        var json = ParseJson(response);
        return new ChangelogDraft(Str(json, "title"), Str(json, "text"), Str(json, "titleEn"), Str(json, "textEn"), StrList(json, "tags"));
    }

    // Generic JSON translation for the small documents (the Nu page). Same rules as the site content.
    public async Task<T> TranslateJsonAsync<T>(T source, string lang, CancellationToken ct)
    {
        var language = lang == "en" ? "English" : lang;
        var json = System.Text.Json.JsonSerializer.Serialize(source, JsonFileContentStore.Json);
        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = ChatModel,
            MaxTokens = 4000,
            OutputConfig = new OutputConfig { Effort = Effort.Low },
            System = new List<TextBlockParam> { new() { Text = $"""
                You translate a small JSON document from Haval Jalal's portfolio site from Swedish to {language}.
                Return ONLY the translated JSON (no code fences, no commentary) with exactly the same structure and keys.
                Translate every human-readable string; keep dates, URLs and technology names unchanged. Natural {language}, first person where the source is.
                """ } },
            Messages = [new UserMessageParam { Content = json }],
        }, cancellationToken: ct);
        await guard.RecordAsync("translate", ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
            response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);
        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException("Translation was not JSON");
        return System.Text.Json.JsonSerializer.Deserialize<T>(text[start..(end + 1)], JsonFileContentStore.Json)
               ?? throw new InvalidOperationException("Translation was empty");
    }

    private static System.Text.Json.JsonElement ParseJson(Message response)
    {
        var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException("Draft was not JSON");
        return System.Text.Json.JsonDocument.Parse(text[start..(end + 1)]).RootElement;
    }

    private static string Str(System.Text.Json.JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() ?? "" : "";

    private static List<string> StrList(System.Text.Json.JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Array
            ? v.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList()
            : [];

    // Streams text deltas; the final Usage is reported through the callback after the stream ends.
    // Eco mode (past the daily eco threshold) swaps to Sonnet with a shorter prototype. A deadline
    // (AGENT_BUILD_DEADLINE_SEC) ends the stream early and marks the build truncated.
    public async IAsyncEnumerable<string> BuildStreamAsync(
        string idea,
        bool eco,
        string lang,
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
            System = new List<TextBlockParam> { new() { Text = Prompts.Build(site, eco, lang), CacheControl = new CacheControlEphemeral() } },
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
