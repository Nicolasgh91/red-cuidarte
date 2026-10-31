import { useState } from "react";
import type { ReactNode } from "react";
import { errorMessage } from "../../api/errors";
import { useAdminContent, useResetContent, useSaveContent } from "../../api/queries/admin";
import { Field, PageHead } from "../../components/common";
import { Async } from "../../components/common";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toasts";
import { CATS, CONTENT_ICONS } from "../../content";
import type {
  Article,
  ContentIcon,
  ContentKey,
  LandingContent,
  PageContent,
  PageKey,
  SiteContent,
} from "../../content";
import { blocksToText, textToBlocks } from "../../lib/blocksText";

type TabId = "quotes" | "landing" | "articles" | "faq" | "pages";
const TABS: { id: TabId; label: string }[] = [
  { id: "quotes", label: "Frases" },
  { id: "landing", label: "Landing" },
  { id: "articles", label: "Recursos" },
  { id: "faq", label: "Preguntas frecuentes" },
  { id: "pages", label: "Páginas" },
];
const PAGES: { id: PageKey; label: string }[] = [
  { id: "acerca", label: "Acerca de" },
  { id: "terminos", label: "Términos" },
  { id: "privacidad", label: "Privacidad" },
];

/** Guardar / volver al texto original, con el error a la vista. */
function useEditor(key: ContentKey, onReset: () => void) {
  const save = useSaveContent();
  const reset = useResetContent();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    busy: save.isPending || reset.isPending,
    async save(value: SiteContent[ContentKey]) {
      setError(null);
      try {
        await save.mutateAsync({ key, value });
        toast("Guardado. Ya se ve en la web.");
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    async restore() {
      if (!window.confirm("¿Volver al texto original? Se pierden tus cambios en esta sección.")) {
        return;
      }
      setError(null);
      try {
        await reset.mutateAsync(key);
        onReset();
        toast("Se restauró el texto original.");
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  };
}

function Actions({
  custom,
  busy,
  error,
  onRestore,
  onSave,
}: {
  custom: boolean;
  busy: boolean;
  error: string | null;
  onRestore: () => void;
  onSave: () => void;
}) {
  return (
    <>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="row-between">
        <button className="primary-btn auto" type="button" disabled={busy} onClick={onSave}>
          Guardar
        </button>
        {custom && (
          <button className="ghost" type="button" disabled={busy} onClick={onRestore}>
            Volver al texto original
          </button>
        )}
      </div>
    </>
  );
}

function IconSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: ContentIcon) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as ContentIcon)}>
      {CONTENT_ICONS.map((i) => (
        <option key={i} value={i}>
          {i}
        </option>
      ))}
    </select>
  );
}

/** Una por línea. */
function QuotesEditor({
  value,
  custom,
  onReset,
}: {
  value: string[];
  custom: boolean;
  onReset: () => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  const ed = useEditor("quotes", onReset);
  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Frases del día
      </h2>
      <Field
        id="ct-quotes"
        label="Frases"
        hint="Una por línea. Cada día se muestra una distinta, en la landing y en Inicio."
      >
        <textarea id="ct-quotes" rows={9} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Actions
        custom={custom}
        busy={ed.busy}
        error={ed.error}
        onRestore={() => void ed.restore()}
        onSave={() =>
          void ed.save(
            text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean),
          )
        }
      />
    </section>
  );
}

function LandingEditor({
  value,
  custom,
  onReset,
}: {
  value: LandingContent;
  custom: boolean;
  onReset: () => void;
}) {
  const [v, setV] = useState<LandingContent>(value);
  const ed = useEditor("landing", onReset);
  const setFeature = (i: number, patch: Partial<LandingContent["features"][number]>) =>
    setV({ ...v, features: v.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const setStep = (i: number, patch: Partial<LandingContent["steps"][number]>) =>
    setV({ ...v, steps: v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Textos de la landing
      </h2>
      <div className="form">
        <Field id="ct-tagline" label="Lema">
          <input
            type="text"
            id="ct-tagline"
            value={v.tagline}
            onChange={(e) => setV({ ...v, tagline: e.target.value })}
          />
        </Field>
        <Field id="ct-lead" label="Bajada">
          <input
            type="text"
            id="ct-lead"
            value={v.lead}
            onChange={(e) => setV({ ...v, lead: e.target.value })}
          />
        </Field>
        <h3>Qué te ofrece</h3>
        {v.features.map((f, i) => (
          <div className="card pcard" key={i}>
            <div className="two">
              <Field id={`ct-f-t-${i}`} label="Título">
                <input
                  type="text"
                  id={`ct-f-t-${i}`}
                  value={f.title}
                  onChange={(e) => setFeature(i, { title: e.target.value })}
                />
              </Field>
              <Field id={`ct-f-i-${i}`} label="Ícono">
                <IconSelect
                  id={`ct-f-i-${i}`}
                  value={f.icon}
                  onChange={(icon) => setFeature(i, { icon })}
                />
              </Field>
            </div>
            <Field id={`ct-f-x-${i}`} label="Texto">
              <input
                type="text"
                id={`ct-f-x-${i}`}
                value={f.text}
                onChange={(e) => setFeature(i, { text: e.target.value })}
              />
            </Field>
            <button
              className="icon-btn"
              type="button"
              aria-label={`Quitar ${f.title || "característica"}`}
              onClick={() => setV({ ...v, features: v.features.filter((_, j) => j !== i) })}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <button
          className="ghost"
          type="button"
          onClick={() =>
            setV({ ...v, features: [...v.features, { icon: "heart", title: "", text: "" }] })
          }
        >
          <Icon name="plus" /> Agregar característica
        </button>
        <h3>Cómo funciona</h3>
        {v.steps.map((s, i) => (
          <div className="card pcard" key={i}>
            <Field id={`ct-s-t-${i}`} label={`Paso ${i + 1}`}>
              <input
                type="text"
                id={`ct-s-t-${i}`}
                value={s.title}
                onChange={(e) => setStep(i, { title: e.target.value })}
              />
            </Field>
            <Field id={`ct-s-x-${i}`} label="Descripción">
              <input
                type="text"
                id={`ct-s-x-${i}`}
                value={s.text}
                onChange={(e) => setStep(i, { text: e.target.value })}
              />
            </Field>
            <button
              className="icon-btn"
              type="button"
              aria-label={`Quitar paso ${i + 1}`}
              onClick={() => setV({ ...v, steps: v.steps.filter((_, j) => j !== i) })}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <button
          className="ghost"
          type="button"
          onClick={() => setV({ ...v, steps: [...v.steps, { title: "", text: "" }] })}
        >
          <Icon name="plus" /> Agregar paso
        </button>
      </div>
      <Actions
        custom={custom}
        busy={ed.busy}
        error={ed.error}
        onRestore={() => void ed.restore()}
        onSave={() => void ed.save(v)}
      />
    </section>
  );
}

const slug = (title: string, taken: string[]): string => {
  const base =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "recurso";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

interface ArticleDraft extends Omit<Article, "body"> {
  body: string;
}

function ArticlesEditor({
  value,
  custom,
  onReset,
}: {
  value: Article[];
  custom: boolean;
  onReset: () => void;
}) {
  const [items, setItems] = useState<ArticleDraft[]>(
    value.map((a) => ({ ...a, body: blocksToText(a.body) })),
  );
  const [open, setOpen] = useState(0);
  const ed = useEditor("articles", onReset);
  const a = items[open];
  const patch = (p: Partial<ArticleDraft>) =>
    setItems(items.map((x, i) => (i === open ? { ...x, ...p } : x)));
  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Recursos
      </h2>
      <div className="form">
        <Field id="ct-a-pick" label="Recurso">
          <select
            id="ct-a-pick"
            value={open}
            onChange={(e) => setOpen(Number(e.target.value))}
            disabled={!items.length}
          >
            {items.map((x, i) => (
              <option key={x.id} value={i}>
                {x.title || "(sin título)"}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            const id = slug(
              "recurso nuevo",
              items.map((x) => x.id),
            );
            setItems([...items, { id, cat: CATS[0], icon: "book", title: "", desc: "", body: "" }]);
            setOpen(items.length);
          }}
        >
          <Icon name="plus" /> Nuevo recurso
        </button>
        {a && (
          <>
            <Field id="ct-a-title" label="Título">
              <input
                type="text"
                id="ct-a-title"
                value={a.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field id="ct-a-desc" label="Descripción corta">
              <input
                type="text"
                id="ct-a-desc"
                value={a.desc}
                onChange={(e) => patch({ desc: e.target.value })}
              />
            </Field>
            <div className="two">
              <Field id="ct-a-cat" label="Categoría">
                <select
                  id="ct-a-cat"
                  value={a.cat}
                  onChange={(e) => patch({ cat: e.target.value as Article["cat"] })}
                >
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ct-a-icon" label="Ícono">
                <IconSelect id="ct-a-icon" value={a.icon} onChange={(icon) => patch({ icon })} />
              </Field>
            </div>
            <Field
              id="ct-a-body"
              label="Contenido"
              hint="Párrafos separados por una línea en blanco. «## Título» para un subtítulo y «- » al inicio de cada línea para una lista."
            >
              <textarea
                id="ct-a-body"
                rows={14}
                value={a.body}
                onChange={(e) => patch({ body: e.target.value })}
              />
            </Field>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                if (!window.confirm(`¿Quitar «${a.title || "este recurso"}»?`)) return;
                setItems(items.filter((_, i) => i !== open));
                setOpen(0);
              }}
            >
              <Icon name="trash" /> Quitar este recurso
            </button>
          </>
        )}
      </div>
      <Actions
        custom={custom}
        busy={ed.busy}
        error={ed.error}
        onRestore={() => void ed.restore()}
        onSave={() => void ed.save(items.map((x) => ({ ...x, body: textToBlocks(x.body) })))}
      />
    </section>
  );
}

function FaqEditor({
  value,
  custom,
  onReset,
}: {
  value: [string, string][];
  custom: boolean;
  onReset: () => void;
}) {
  const [items, setItems] = useState(value);
  const ed = useEditor("faq", onReset);
  const set = (i: number, k: 0 | 1, text: string) =>
    setItems(items.map((p, j) => (j === i ? (k ? [p[0], text] : [text, p[1]]) : p)));
  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Preguntas frecuentes
      </h2>
      <div className="form">
        {items.map((p, i) => (
          <div className="card pcard" key={i}>
            <Field id={`ct-q-${i}`} label={`Pregunta ${i + 1}`}>
              <input
                type="text"
                id={`ct-q-${i}`}
                value={p[0]}
                onChange={(e) => set(i, 0, e.target.value)}
              />
            </Field>
            <Field id={`ct-r-${i}`} label="Respuesta">
              <textarea
                id={`ct-r-${i}`}
                rows={3}
                value={p[1]}
                onChange={(e) => set(i, 1, e.target.value)}
              />
            </Field>
            <button
              className="icon-btn"
              type="button"
              aria-label={`Quitar pregunta ${i + 1}`}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <button className="ghost" type="button" onClick={() => setItems([...items, ["", ""]])}>
          <Icon name="plus" /> Agregar pregunta
        </button>
      </div>
      <Actions
        custom={custom}
        busy={ed.busy}
        error={ed.error}
        onRestore={() => void ed.restore()}
        onSave={() => void ed.save(items)}
      />
    </section>
  );
}

function PageEditor({
  pageKey,
  value,
  custom,
  onReset,
}: {
  pageKey: PageKey;
  value: PageContent;
  custom: boolean;
  onReset: () => void;
}) {
  const [title, setTitle] = useState(value.title);
  const [sub, setSub] = useState(value.sub ?? "");
  const [note, setNote] = useState(value.note ?? "");
  const [body, setBody] = useState(blocksToText(value.blocks));
  const ed = useEditor(pageKey, onReset);
  return (
    <div className="form">
      <Field id="ct-p-title" label="Título">
        <input
          type="text"
          id="ct-p-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field
        id="ct-p-sub"
        label={
          <>
            Subtítulo <span className="light">(opcional)</span>
          </>
        }
      >
        <input type="text" id="ct-p-sub" value={sub} onChange={(e) => setSub(e.target.value)} />
      </Field>
      <Field
        id="ct-p-note"
        label={
          <>
            Aviso <span className="light">(opcional)</span>
          </>
        }
      >
        <input type="text" id="ct-p-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field
        id="ct-p-body"
        label="Contenido"
        hint="Párrafos separados por una línea en blanco. «## Título» para un subtítulo y «- » al inicio de cada línea para una lista. Los mails se vuelven enlaces."
      >
        <textarea id="ct-p-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Actions
        custom={custom}
        busy={ed.busy}
        error={ed.error}
        onRestore={() => void ed.restore()}
        onSave={() =>
          void ed.save({
            title: title.trim(),
            ...(sub.trim() ? { sub: sub.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            blocks: textToBlocks(body),
          })
        }
      />
    </div>
  );
}

function PagesEditor({
  content,
  custom,
  onReset,
}: {
  content: SiteContent;
  custom: ContentKey[];
  onReset: () => void;
}) {
  const [page, setPage] = useState<PageKey>("acerca");
  return (
    <section className="card rcard">
      <h2 className="section" style={{ fontSize: "1.2rem" }}>
        Páginas
      </h2>
      <Field id="ct-page" label="Página">
        <select id="ct-page" value={page} onChange={(e) => setPage(e.target.value as PageKey)}>
          {PAGES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {custom.includes(p.id) ? " (editada)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <PageEditor
        key={page}
        pageKey={page}
        value={content[page]}
        custom={custom.includes(page)}
        onReset={onReset}
      />
    </section>
  );
}

export function AdminContenido() {
  const q = useAdminContent();
  const [tab, setTab] = useState<TabId>("quotes");
  // Al volver al texto original se recrea el editor con el valor que llega del servidor.
  const [version, setVersion] = useState(0);
  const onReset = () => setVersion((n) => n + 1);

  return (
    <div className="page">
      <PageHead
        title="Contenido de la web"
        sub="Frases, recursos, preguntas frecuentes y textos. Los cambios se ven al instante."
      />
      <div role="tablist" aria-label="Secciones del contenido" className="group">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            className={tab === t.id ? "primary-btn auto" : "ghost"}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Async query={q}>
        {({ content, custom }) => {
          const key = `${tab}-${version}`;
          const isCustom = (k: ContentKey): boolean => custom.includes(k);
          const panels: Record<TabId, ReactNode> = {
            quotes: (
              <QuotesEditor
                key={key}
                value={content.quotes}
                custom={isCustom("quotes")}
                onReset={onReset}
              />
            ),
            landing: (
              <LandingEditor
                key={key}
                value={content.landing}
                custom={isCustom("landing")}
                onReset={onReset}
              />
            ),
            articles: (
              <ArticlesEditor
                key={key}
                value={content.articles}
                custom={isCustom("articles")}
                onReset={onReset}
              />
            ),
            faq: (
              <FaqEditor key={key} value={content.faq} custom={isCustom("faq")} onReset={onReset} />
            ),
            pages: <PagesEditor key={key} content={content} custom={custom} onReset={onReset} />,
          };
          return <div role="tabpanel">{panels[tab]}</div>;
        }}
      </Async>
    </div>
  );
}
