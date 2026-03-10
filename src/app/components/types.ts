export interface Scripture {
  id: string;
  title: string;
  url: string;
  categories?: string[];
  writer?: string;
  tikas?: string[];
  description?: string;
}