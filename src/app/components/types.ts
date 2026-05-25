export interface VectorSearchResult {
  score: number;
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  preview: string;
  categories: string[];
}

export interface Scripture {
  id: string;
  title: string;
  url: string;
  gcsPath?: string;
  status?: string;
  pageCount?: number;
  categories?: string[];
  writer?: string;
  tikakar?: string[];
  description?: string;
}