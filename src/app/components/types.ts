export interface Scripture {
  id: string;
  title: string;
  url: string;
  gcsPath?: string;
  categories?: string[];
  writer?: string;
  tikakar?: string[];
  description?: string;
}