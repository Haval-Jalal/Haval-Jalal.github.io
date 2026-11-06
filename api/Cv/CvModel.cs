using HavalApi.Data;

namespace HavalApi.Cv;

// Rendering model for the PDF. Haval's own CV is mapped from SiteContent; the visitor CV builder
// fills the same shape from a form, so both share one document design.
public sealed record CvModel(
    string Name,
    string Role,
    string Location,
    string Summary,
    List<CvContact> Contacts,
    List<CvExperience> Experience,
    List<CvProject> Projects,
    List<CvSkillGroup> Skills,
    List<CvEducation> Education,
    string Footer,
    string Accent = "#d9772a");

public sealed record CvContact(string Label, string Value, string? Url = null);
public sealed record CvExperience(string Period, string Title, string Org, string Text, List<string> Bullets);
public sealed record CvProject(string Title, string Summary, List<string> Tags, string? Url, string Year);
public sealed record CvSkillGroup(string Title, List<string> Items);
public sealed record CvEducation(string School, string Program);

public static class CvMapper
{
    public static CvModel FromSite(SiteContent c)
    {
        var p = c.Profile;
        var contacts = new List<CvContact>();
        if (!string.IsNullOrWhiteSpace(p.Links.Email)) contacts.Add(new("E-post", p.Links.Email, $"mailto:{p.Links.Email}"));
        if (!string.IsNullOrWhiteSpace(p.Links.Github)) contacts.Add(new("GitHub", p.Links.Github.Replace("https://", ""), p.Links.Github));
        if (!string.IsNullOrWhiteSpace(p.Links.Linkedin)) contacts.Add(new("LinkedIn", p.Links.Linkedin.Replace("https://", ""), p.Links.Linkedin));
        contacts.Add(new("Webb", "havaljalal.se", "https://havaljalal.se"));

        return new CvModel(
            p.Name,
            p.Role,
            p.Location,
            p.About,
            contacts,
            c.Journey.Select(j => new CvExperience(j.Period, j.Title, j.Org, j.Text, j.Bullets ?? [])).ToList(),
            c.Projects.Where(x => !x.Hidden).Select(x => new CvProject(x.Title, x.Summary, x.Tags, x.Repo, x.Year)).ToList(),
            c.Skills.Select(s => new CvSkillGroup(s.Title, s.Items)).ToList(),
            c.Education.Select(e => new CvEducation(e.School, e.Program)).ToList(),
            $"Genererat från havaljalal.se {DateTime.UtcNow:yyyy-MM-dd}. Innehållet hålls uppdaterat på sajten.");
    }
}
