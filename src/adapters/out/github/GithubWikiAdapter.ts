import { IWikiSourcePort } from "@domain/ports/out/IWikiSourcePort";
import { WikiDocument } from "@domain/entities/WikiDocument";
import { extractHistoryKeywords } from "@domain/wikiSearchText";
import axios from "axios";
import { config } from "@infrastructure/config";
import * as crypto from "crypto";

export class GithubWikiAdapter implements IWikiSourcePort {
  public async fetchWikiPages(): Promise<WikiDocument[]> {
    const url = `${process.env.GITHUB_TEMPLATE_URL}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Wiki-Lens-App'
      }
    });

    const markdown = response.data;
    return this.parseMarkdown(markdown);
  }

  private parseMarkdown(markdown: string): WikiDocument[] {
    const docs: WikiDocument[] = [];
    const tableRowRegex = /^\|\s*\*\*(.*?)\*\*\s*\|\s*(.*?)\s*\|/gm;

    let match;
    while ((match = tableRowRegex.exec(markdown)) !== null) {
      const filename = match[1].trim();
      const description = match[2].trim();
      if (filename.toLowerCase() === "template filename") continue;
      const id = crypto.randomBytes(3).toString("hex");
      const fullContent = `Template: ${filename}\nDescription: ${description}`;

      const tokens = extractHistoryKeywords(fullContent);

      docs.push(new WikiDocument({
        id,
        markdown_content: `**${filename}** | ${description}`,
        tokens
      }));
    }

    return docs;
  }
}
