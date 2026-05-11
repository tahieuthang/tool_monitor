import { WikiDocument } from "@domain/entities/WikiDocument";

export interface IWikiSourcePort {
    fetchWikiPages(): Promise<WikiDocument[]>;
}
