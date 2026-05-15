export interface Match {
    markdown_content: string;
}

export class MatchResult {
    public ticket_id: string;
    public status: 'success' | 'not_found';
    public matches: Match[];
    /** Present when `status` is `not_found` — human-readable English message for the client. */
    public message?: string;

    constructor(ticket_id: string, status: 'success' | 'not_found', matches: Match[], message?: string) {
        this.ticket_id = ticket_id;
        this.status = status;
        this.matches = matches;
        this.message = message;
    }
}