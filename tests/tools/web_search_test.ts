import { assertEquals } from "@std/assert";
import { parseDuckDuckGoHtml } from "../../src/tools/implementations.ts";

Deno.test("parseDuckDuckGoHtml extracts search results", () => {
  const mockHtml = `
    <html>
      <body>
        <div class="result">
          <a href="https://example.com/1" class="result__a">Title 1</a>
          <div class="result__snippet">Snippet 1</div>
        </div>
        <div class="result">
          <a href="https://example.com/2" class="result__a">Title 2</a>
          <div class="result__snippet">Snippet 2</div>
        </div>
      </body>
    </html>
  `;

  const results = parseDuckDuckGoHtml(mockHtml);

  assertEquals(results.length, 2);
  assertEquals(results[0], {
    title: "Title 1",
    url: "https://example.com/1",
    snippet: "Snippet 1",
  });
  assertEquals(results[1], {
    title: "Title 2",
    url: "https://example.com/2",
    snippet: "Snippet 2",
  });
});

Deno.test("parseDuckDuckGoHtml handles empty results", () => {
  const mockHtml = "<html><body></body></html>";
  const results = parseDuckDuckGoHtml(mockHtml);
  assertEquals(results.length, 0);
});
