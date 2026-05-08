import { InvalidDataError } from "@domain/errors/InvalidDataError"
import { TicketNotFoundError } from "@domain/errors/TicketNotFoundError"

export class MatchResult {
    public markdown: string;

    constructor(
        markdown: string
    ) {
        this.markdown = markdown;
    }
}