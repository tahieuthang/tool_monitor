import { InvalidDataError } from "@domain/errors/InvalidDataError"

export interface WikiDocumentProps {
  template_filename: string;
  usage_description: string;
}

export class WikiDocument {
  public template_filename: string;
  public usage_description: string;

  constructor(props: WikiDocumentProps) {
    this.template_filename = props.template_filename;
    this.usage_description = props.usage_description;
    this.validate();
  }

  private validate() {
    if (!this.template_filename) {
      throw new InvalidDataError("WikiDocument ID is required");
    }
    if (!this.usage_description) {
      throw new InvalidDataError("WikiDocument content is required");
    }
  }
}