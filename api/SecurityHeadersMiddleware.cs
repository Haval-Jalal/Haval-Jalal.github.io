using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;

namespace HavalApi;

// Static Web Apps' globalHeaders (staticwebapp.config.json) cover the static site but do NOT reach
// the Functions-proxied /api/* responses. This adds X-Content-Type-Options: nosniff to every API
// response so JSON can't be MIME-sniffed into something executable.
public sealed class SecurityHeadersMiddleware : IFunctionsWorkerMiddleware
{
    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        var http = context.GetHttpContext();
        if (http is not null)
        {
            http.Response.OnStarting(() =>
            {
                http.Response.Headers["X-Content-Type-Options"] = "nosniff";
                return Task.CompletedTask;
            });
        }
        await next(context);
    }
}
