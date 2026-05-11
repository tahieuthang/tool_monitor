import { InvalidDataError } from "@domain/errors/InvalidDataError";

export interface WikiDocumentProps {
  id: string;
  markdown_content: string;
  tokens: string[];
}

export class WikiDocument {
  public id: string;
  public markdown_content: string;
  public tokens: string[];

  constructor(props: WikiDocumentProps) {
    this.id = props.id;
    this.markdown_content = props.markdown_content;
    this.tokens = props.tokens;
    this.validate();
  }

  private validate() {
    if (!this.id) {
      throw new InvalidDataError("WikiDocument id is required");
    }
    if (!this.markdown_content) {
      throw new InvalidDataError("WikiDocument content is required");
    }
  }
}