import type { KnowledgeDoc } from "../agents/types";
import seedDocs from "./knowledge_docs.json";

export const knowledgeDocs: KnowledgeDoc[] = seedDocs.map((item) => ({
  id: item.id,
  title: item.title,
  category: item.category,
  categoryLabel: categoryLabel(item.category),
  region: item.region,
  year: item.year,
  summary: item.summary,
  sourceUrl: item.sourceUrl,
  sourceLabel: item.sourceLabel,
  tags: item.tags,
  isActive: true
}));

function categoryLabel(category: string) {
  if (category === "law") return "法律规范";
  if (category === "judicial_interpretation") return "司法解释";
  if (category === "local_case") return "重庆典型案例";
  if (category === "procedure") return "重庆程序";
  if (category === "policy") return "重庆政策";
  return category;
}
