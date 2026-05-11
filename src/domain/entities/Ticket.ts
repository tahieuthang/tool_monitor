import { InvalidDataError } from "@domain/errors/InvalidDataError"
import { TicketNotFoundError } from "@domain/errors/TicketNotFoundError"

export interface TicketProps {
  id: string;
  message: string;
}

export class Ticket {
  public readonly id: string;
  public message: string;

  constructor(props: TicketProps) {
    this.id = props.id;
    this.message = props.message;
    this.validate();
  }

  private validate() {
    if (!this.id) {
      throw new InvalidDataError("Ticket ID is required");
    }
    if (!this.message) {
      throw new InvalidDataError("Ticket message is required");
    }
  }
}