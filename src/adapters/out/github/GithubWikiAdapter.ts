import { IWikiSourcePort } from "@domain/ports/out/IWikiSourcePort";
import { WikiDocument } from "@domain/entities/WikiDocument";
import axios from "axios";
import { config } from "@infrastructure/config";
import * as crypto from "crypto";

export class GithubWikiAdapter implements IWikiSourcePort {
  public async fetchWikiPages(): Promise<WikiDocument[]> {
    const url = `https://raw.githubusercontent.com/QuanAnhDo/wiki-hub/main/5.-Response-Templates/5.5-Template-Description.md`;
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

      const tokens = this.tokenize(fullContent);

      docs.push(new WikiDocument({
        id,
        markdown_content: `**${filename}** | ${description}`,
        tokens
      }));
    }

    return docs;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 2);
  }
}
