namespace HavalApi.Cv;

// Section headings and contact labels in the PDF, per language.
public sealed record CvLabels(string Profile, string Experience, string Projects, string Stack, string Education, string Email, string Web, string Footer)
{
    public static readonly CvLabels Sv = new("Profil", "Erfarenhet", "Projekt", "Stack", "Utbildning", "E-post", "Webb",
        "Genererat från havaljalal.se {0}. Innehållet hålls uppdaterat på sajten.");
    public static readonly CvLabels En = new("Profile", "Experience", "Projects", "Stack", "Education", "Email", "Web",
        "Generated from havaljalal.se {0}. The content is kept up to date on the site.");

    public static CvLabels For(string? lang) => lang == "en" ? En : Sv;
    public static string Normalise(string? lang) => lang == "en" ? "en" : "sv";
}
