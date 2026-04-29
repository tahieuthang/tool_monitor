import { InvalidDataError } from "@domain/errors/InvalidDataError"
import { TicketNotFoundError } from "@domain/errors/TicketNotFoundError"

export enum TicketStatus {
	NEW = 'new',
	IN_PROGRESS = 'in_progress',
	ON_HOLD = 'on_hold',
	RESOLVED = 'resolved',
	CANCELLED = 'cancelled'
}
export enum TicketPriority {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
	URGENT = 'urgent'
}

export interface TicketProps {
	id: string;
	title: string;
	action: 'ENROLL' | 'UNCOMPLETE' | 'WITHDRAW' | 'OTHER';
	description: string;
	branch: string;
	classId: string;
	student: { name: string; phone: string };
	sender: { name: string; email: string; id?: string };
	priority: TicketPriority;
	createdAt: Date;
	status?: string; // Có thể để optional nếu có giá trị mặc định
}

// src/domain/entities/TicketEntity.ts

export class Ticket {
	// 1. Dữ liệu từ BAML (đã được map sang kiểu dữ liệu xịn)
	public readonly id: string;
	public title: string;
	public action: 'ENROLL' | 'UNCOMPLETE' | 'WITHDRAW' | 'OTHER';
	public description: string;
	public branch: string;
	public classId: string;
	public student: { name: string; phone: string };
	public sender: { name: string; email: string };
	public priority: TicketPriority;
	public status: TicketStatus;
	public createdAt: Date;

	public rootCause?: string;      // Lấy từ file Wiki
	public resolution?: string;    // Phương án xử lý từ Wiki
	public emailTemplate?: string; // Tên file .md tương ứng
	public generatedEmail?: string; // Nội dung email hoàn chỉnh
	public validationErrors: string[] = [];

	constructor(props: TicketProps) {
		this.id = props.id;
		this.title = props.title;
		this.action = props.action;
		this.description = props.description;
		this.branch = props.branch;
		this.classId = props.classId;
		this.student = props.student;
		this.sender = props.sender;
		this.priority = props.priority;
		this.createdAt = props.createdAt;
		this.status = props.status as TicketStatus || TicketStatus.NEW;
	}

	// 3. Các hàm logic nghiệp vụ (Domain Logic)
	public markAsInvalid(reason: string) {
		this.status = TicketStatus.CANCELLED;
		this.validationErrors.push(reason);
	}

	public setResolution(cause: string, plan: string, template: string) {
		this.rootCause = cause;
		this.resolution = plan;
		this.emailTemplate = template;
		this.status = TicketStatus.RESOLVED;
	}
}