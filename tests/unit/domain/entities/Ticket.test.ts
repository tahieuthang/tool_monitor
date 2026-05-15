import { Ticket } from "@domain/entities/Ticket";
import { InvalidDataError } from "@domain/errors/InvalidDataError";

describe("Ticket Entity", () => {
  it("should create a valid Ticket instance", () => {
    const props = { id: "T-001", message: "Help me" };
    const ticket = new Ticket(props);
    expect(ticket.id).toBe(props.id);
    expect(ticket.message).toBe(props.message);
  });

  it("should throw InvalidDataError if id is empty", () => {
    expect(() => new Ticket({ id: "", message: "msg" })).toThrow(InvalidDataError);
    expect(() => new Ticket({ id: "", message: "msg" })).toThrow("Ticket ID is required");
  });

  it("should throw InvalidDataError if message is empty", () => {
    expect(() => new Ticket({ id: "id", message: "" })).toThrow(InvalidDataError);
    expect(() => new Ticket({ id: "id", message: "" })).toThrow("Ticket message is required");
  });
});
