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
                    foreach (var k in cv.Contacts)
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
                main.Item().Element(x => Section(x, "Profil", s => s.Item().Text(cv.Summary).FontSize(9.5f)));

                main.Item().Element(x => Section(x, "Erfarenhet", s =>
                {
                    s.Spacing(10);
                    foreach (var e in cv.Experience)
                    {
                        s.Item().Column(item =>
                        {
                            item.Item().Row(r =>
                            {
                                r.RelativeItem().Text(e.Title).SemiBold().FontSize(10.5f);
                                r.ConstantItem(90).AlignRight().Text(e.Period).FontSize(8.5f).FontColor(_accent).SemiBold();
                            });
                            item.Item().Text(e.Org).FontSize(9).FontColor(Muted);
                            item.Item().PaddingTop(3).Text(e.Text);
                            foreach (var b in e.Bullets)
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

                main.Item().Element(x => Section(x, "Projekt", s =>
                {
                    s.Spacing(8);
                    foreach (var p in cv.Projects)
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
                            item.Item().Text(p.Summary);
                            if (p.Tags.Count > 0)
                                item.Item().PaddingTop(2).Text(string.Join("  ·  ", p.Tags)).FontSize(8).FontColor(Muted);
                        });
                    }
                }));
            });

            row.RelativeItem(1).PaddingLeft(18).BorderLeft(1).BorderColor(Line).PaddingLeft(14).Column(side =>
            {
                side.Spacing(14);
                side.Item().Element(x => Section(x, "Stack", s =>
                {
                    s.Spacing(7);
                    foreach (var g in cv.Skills)
                    {
                        s.Item().Column(item =>
                        {
                            item.Item().Text(g.Title).FontSize(8.5f).SemiBold().FontColor(Ink);
                            item.Item().Text(string.Join(", ", g.Items)).FontSize(8.5f).FontColor(Muted);
                        });
                    }
                }));
                side.Item().Element(x => Section(x, "Utbildning", s =>
                {
                    s.Spacing(6);
                    foreach (var e in cv.Education)
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
