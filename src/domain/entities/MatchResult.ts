export interface Match {
    markdown_content: string;
}

export class MatchResult {
    public ticket_id: string;
    public status: 'success' | 'not_found';
    public matches: Match[];

    constructor(ticket_id: string, status: 'success' | 'not_found', matches: Match[]) {
        this.ticket_id = ticket_id;
        this.status = status;
        this.matches = matches;
    }
}