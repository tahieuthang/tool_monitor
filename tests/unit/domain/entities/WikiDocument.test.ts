import { WikiDocument } from "@domain/entities/WikiDocument";
import { InvalidDataError } from "@domain/errors/InvalidDataError";

describe("WikiDocument Entity", () => {
  it("should create a valid WikiDocument instance", () => {
    const props = {
      id: "W-001",
      markdown_content: "Content",
      tokens: ["content"]
    };
    const doc = new WikiDocument(props);
    expect(doc.id).toBe(props.id);
    expect(doc.markdown_content).toBe(props.markdown_content);
    expect(doc.tokens).toEqual(props.tokens);
  });

  it("should throw InvalidDataError if id is empty", () => {
    expect(() => new WikiDocument({ id: "", markdown_content: "c", tokens: [] })).toThrow(InvalidDataError);
  });

  it("should throw InvalidDataError if markdown_content is empty", () => {
    expect(() => new WikiDocument({ id: "id", markdown_content: "", tokens: [] })).toThrow(InvalidDataError);
  });
});
