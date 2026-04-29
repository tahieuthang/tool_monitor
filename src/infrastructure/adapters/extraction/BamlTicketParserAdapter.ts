import fs from 'fs';
import path from 'path';
import * as b from '@baml_src/main.baml';

async function runAutomationPipeline() {
	const inputDir = '@raw_tickets';
	const files = fs.readdirSync(inputDir);

	for (const file of files) {
		const rawText = fs.readFileSync(path.join(inputDir, file), 'utf-8');

		console.log(`--- Đang xử lý: ${file} ---`);

		// Bước 1: BAML bóc tách
		const data = await b.ExtractMindXTicket(rawText);

		// Bước 2: Gọi Use Case xử lý (Hexagonal)
		// Ví dụ: handleTicketUseCase.execute(data);

		// Bước 3: Lưu vào DB để Dashboard Vue 3 hiển thị
		// await ticketRepo.save(data);

		console.log(`Done: ${data.ticket.id}`);
	}
}