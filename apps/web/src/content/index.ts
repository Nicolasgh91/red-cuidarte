// Contenido de la web (recursos, preguntas frecuentes, frases, textos de la landing y páginas):
// los tipos y los textos originales salen de la API, que también deja al admin reemplazarlos.
export {
  CATS,
  CONTENT_ICONS,
  DEFAULT_CONTENT,
  DEFAULT_QUOTES,
} from "../../../api/src/content/site";
export type {
  Block,
  ContentIcon,
  ContentKey,
  LandingContent,
  PageContent,
  PageKey,
  SiteContent,
} from "../../../api/src/content/site";
export type { Article, ArticleBlock, Category } from "../../../api/src/content/index";
