namespace HavalApi.Data;

// Everything the public site renders. Mirrors web/src/data/content.ts; the admin panel edits this
// document and the site reads it from /api/content (falling back to the bundled copy if the API is down).
public sealed record SiteContent(
    Profile Profile,
    List<Project> Projects,
    List<JourneyStep> Journey,
    List<Education> Education,
    List<SkillGroup> Skills,
    List<NavItem> Nav,
    SiteSettings Settings,
    DateTime UpdatedAt);

public sealed record Profile(
    string Name,
    string Role,
    string Tagline,
    string Location,
    string Availability,
    Headline Headline,
    string Intro,
    string About,
    Links Links);

public sealed record Headline(string Lead, string Accent);

public sealed record Links(string Github, string Linkedin, string Email);

// A project is presented like a product: screenshots, a one-line tagline, the story and what it
// does, plus optional links (live site, app store, demo). Repo stays optional and is never required.
public sealed record Project(
    string Slug,
    string Title,
    string Summary,
    List<string> Tags,
    string Repo,
    string Year,
    bool Hidden = false,
    string Status = "",
    string Tagline = "",
    List<string>? Highlights = null,
    List<string>? Images = null,
    List<ProjectLink>? Links = null,
    string Role = "");

public sealed record ProjectLink(string Label, string Url);

public sealed record JourneyStep(
    string Period,
    string Title,
    string Org,
    string Text,
    List<string>? Bullets = null);

public sealed record Education(string School, string Program);

public sealed record SkillGroup(string Title, List<string> Items, bool Accent = false);

public sealed record NavItem(string Label, string Href);

// Site-wide switches the admin panel exposes.
public sealed record SiteSettings(
    string Background = "terrain",
    bool SoundDefault = false,
    bool OpenForWork = true,
    List<string>? SectionOrder = null);
