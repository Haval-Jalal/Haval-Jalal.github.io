using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace HavalApi.Cv;

// A4, print-friendly: white paper, dark ink, one accent colour. Two columns: the story on the
// left, the facts (contact, stack, education) on the right.
public sealed class CvDocument(CvModel cv) : IDocument
{
    private static readonly string Ink = "#1b1b22";
    private static readonly string Muted = "#6b6b78";
    private static readonly string Line = "#e6e6ea";
    private readonly string _accent = cv.Accent;

    public DocumentMetadata GetMetadata() => new()
    {
        Title = $"{cv.Name} – CV",
        Author = cv.Name,
        Subject = cv.Role,
        Creator = "havaljalal.se",
    };

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(38);
            page.DefaultTextStyle(t => t.FontSize(9.5f).FontColor(Ink).LineHeight(1.35f));

            page.Header().Element(Header);
            page.Content().PaddingTop(18).Element(Body);
            page.Footer().Element(Footer);
        });
    }

    private void Header(IContainer c)
    {
        c.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(left =>
                {
                    left.Item().Text(cv.Name).FontSize(24).Bold().FontColor(Ink);
                    left.Item().Text(t =>
                    {
                        t.Span(cv.Role).FontSize(11).FontColor(_accent).SemiBold();
                        t.Span("  ·  " + cv.Location).FontSize(11).FontColor(Muted);
                    });
                });
                row.ConstantItem(170).AlignRight().Column(right =>
                {
                    foreach (var k in cv.Contacts.Where(k => !string.IsNullOrWhiteSpace(k.Value)))
                    {
                        right.Item().Text(t =>
                        {
                            t.Span(k.Label + "  ").FontSize(8).FontColor(Muted);
                            if (k.Url is not null) t.Hyperlink(k.Value, k.Url).FontSize(8.5f).FontColor(Ink);
                            else t.Span(k.Value).FontSize(8.5f).FontColor(Ink);
                        });
                    }
                });
            });
            col.Item().PaddingTop(12).LineHorizontal(1.2f).LineColor(_accent);
        });
    }

    private void Body(IContainer c)
    {
        c.Row(row =>
        {
            row.RelativeItem(2).PaddingRight(18).Column(main =>
            {
                main.Spacing(14);
                if (!string.IsNullOrWhiteSpace(cv.Summary))
                    main.Item().Element(x => Section(x, cv.L.Profile, s => s.Item().Text(cv.Summary).FontSize(9.5f)));

                var experience = cv.Experience.Where(e => !string.IsNullOrWhiteSpace(e.Title) || !string.IsNullOrWhiteSpace(e.Org)).ToList();
                if (experience.Count > 0)
                main.Item().Element(x => Section(x, cv.L.Experience, s =>
                {
                    s.Spacing(10);
                    foreach (var e in experience)
                    {
                        s.Item().Column(item =>
                        {
                            item.Item().Row(r =>
                            {
                                r.RelativeItem().Text(e.Title).SemiBold().FontSize(10.5f);
                                r.ConstantItem(90).AlignRight().Text(e.Period).FontSize(8.5f).FontColor(_accent).SemiBold();
                            });
                            if (!string.IsNullOrWhiteSpace(e.Org)) item.Item().Text(e.Org).FontSize(9).FontColor(Muted);
                            if (!string.IsNullOrWhiteSpace(e.Text)) item.Item().PaddingTop(3).Text(e.Text);
                            foreach (var b in e.Bullets.Where(b => !string.IsNullOrWhiteSpace(b)))
                            {
                                item.Item().PaddingLeft(8).Row(r =>
                                {
                                    r.ConstantItem(8).Text("•").FontColor(_accent);
                                    r.RelativeItem().Text(b).FontSize(9);
                                });
                            }
                        });
                    }
                }));

                var projects = cv.Projects.Where(p => !string.IsNullOrWhiteSpace(p.Title)).ToList();
                if (projects.Count > 0)
                main.Item().Element(x => Section(x, cv.L.Projects, s =>
                {
                    s.Spacing(8);
                    foreach (var p in projects)
                    {
                        s.Item().Column(item =>
                        {
                            item.Item().Row(r =>
                            {
                                r.RelativeItem().Text(t =>
                                {
                                    if (!string.IsNullOrWhiteSpace(p.Url)) t.Hyperlink(p.Title, p.Url).SemiBold().FontSize(10.5f);
                                    else t.Span(p.Title).SemiBold().FontSize(10.5f);
                                });
                                r.ConstantItem(50).AlignRight().Text(p.Year).FontSize(8.5f).FontColor(Muted);
                            });
                            if (!string.IsNullOrWhiteSpace(p.Summary)) item.Item().Text(p.Summary);
                            var tags = p.Tags.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
                            if (tags.Count > 0)
                                item.Item().PaddingTop(2).Text(string.Join("  ·  ", tags)).FontSize(8).FontColor(Muted);
                        });
                    }
                }));
            });

            row.RelativeItem(1).PaddingLeft(18).BorderLeft(1).BorderColor(Line).PaddingLeft(14).Column(side =>
            {
                side.Spacing(14);
                var skills = cv.Skills
                    .Select(g => new CvSkillGroup(g.Title, g.Items.Where(i => !string.IsNullOrWhiteSpace(i)).ToList()))
                    .Where(g => g.Items.Count > 0)
                    .ToList();
                if (skills.Count > 0)
                side.Item().Element(x => Section(x, cv.L.Stack, s =>
                {
                    s.Spacing(7);
                    foreach (var g in skills)
                    {
                        s.Item().Column(item =>
                        {
                            if (!string.IsNullOrWhiteSpace(g.Title)) item.Item().Text(g.Title).FontSize(8.5f).SemiBold().FontColor(Ink);
                            item.Item().Text(string.Join(", ", g.Items)).FontSize(8.5f).FontColor(Muted);
                        });
                    }
                }));
                var education = cv.Education.Where(e => !string.IsNullOrWhiteSpace(e.Program) || !string.IsNullOrWhiteSpace(e.School)).ToList();
                if (education.Count > 0)
                side.Item().Element(x => Section(x, cv.L.Education, s =>
                {
                    s.Spacing(6);
                    foreach (var e in education)
                    {
                        s.Item().Column(item =>
                        {
                            item.Item().Text(e.Program).FontSize(9).SemiBold();
                            item.Item().Text(e.School).FontSize(8.5f).FontColor(Muted);
                        });
                    }
                }));
            });
        });
    }

    private void Section(IContainer c, string title, Action<ColumnDescriptor> body)
    {
        c.Column(col =>
        {
            col.Item().PaddingBottom(5).Text(title.ToUpperInvariant()).FontSize(7.5f).LetterSpacing(0.18f).SemiBold().FontColor(_accent);
            col.Item().Column(body);
        });
    }

    private void Footer(IContainer c)
    {
        c.PaddingTop(10).BorderTop(1).BorderColor(Line).PaddingTop(6).Row(row =>
        {
            row.RelativeItem().Text(cv.Footer).FontSize(7.5f).FontColor(Muted);
            row.ConstantItem(60).AlignRight().Text(t =>
            {
                t.DefaultTextStyle(s => s.FontSize(7.5f).FontColor(Muted));
                t.CurrentPageNumber();
                t.Span(" / ");
                t.TotalPages();
            });
        });
    }
}
