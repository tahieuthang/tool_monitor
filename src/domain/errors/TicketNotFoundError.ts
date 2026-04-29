export class TicketNotFoundError extends Error {
    constructor(id: string) {
        super(`Ticket "${id}" không tồn tại.`);
        this.name = 'TicketNotFoundError';
        Object.setPrototypeOf(this, TicketNotFoundError.prototype);
    }
}