import React, { useEffect, useState } from 'react';
import { BookOpen, Search, Plus, Pencil, Trash2, Save, X, Upload } from 'lucide-react';
import { RAGDocument } from '../types/orchestrator';
import { ragKnowledgeBase } from '../data/ragKnowledgeBase';
import { authHeaders, useIsAdmin } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

export const RAGKnowledgeDrawer: React.FC = () => {
  const [docs, setDocs] = useState<RAGDocument[]>(ragKnowledgeBase);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string>(ragKnowledgeBase[0].id);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [editing, setEditing] = useState<Partial<RAGDocument> | null>(null);
  const [backendLive, setBackendLive] = useState(false);
  const admin = useIsAdmin();
  const toast = useToast();

  const load = async () => {
    try {
      const r = await fetch('/api/rag/docs');
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        setDocs(data);
        setBackendLive(true);
        if (!data.some((d: RAGDocument) => d.id === selectedId)) setSelectedId(data[0].id);
      }
    } catch { setBackendLive(false); }
  };
  useEffect(() => { load(); }, []);

  const selectedDoc = docs.find((d) => d.id === selectedId) || docs[0];
  const filteredDocs = docs.filter((doc) => {
    const q = searchTerm.toLowerCase();
    const matches = !q || doc.title.toLowerCase().includes(q) || doc.summary.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q) || doc.relevanceTags.some((t) => t.toLowerCase().includes(q));
    return matches && (categoryFilter === 'ALL' || doc.category === categoryFilter);
  });
  const categories = ['ALL', 'ASSET_SPEC', 'REGULATORY_STANDARD', 'HISTORICAL_CASE', 'ANOMALY_SIGNATURE'];

  const saveEdit = async () => {
    if (!editing || !editing.title || !editing.content) return;
    const h = await authHeaders();
    if (editing.id && docs.some((d) => d.id === editing.id)) {
      const r = await fetch(`/api/rag/docs/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(editing) });
      if (r.ok) { await load(); setEditing(null); toast(`Codex document ${editing.id} updated — live on next dispatch.`, 'success'); }
      else toast(`Update failed: ${(await r.json()).error || r.status}.`, 'error');
    } else {
      const r = await fetch('/api/rag/docs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ ...editing, relevanceTags: editing.relevanceTags || [] }) });
      if (r.ok) { const created = await r.json(); await load(); setSelectedId(created.id); setEditing(null); toast(`Added ${created.id} to the agent codex.`, 'success'); }
      else toast('Create failed — Admin role required.', 'error');
    }
  };
  const remove = async (id: string) => {
    if (!confirm(`Delete ${id}? Agents will lose this context.`)) return;
    const h = await authHeaders();
    const r = await fetch(`/api/rag/docs/${id}`, { method: 'DELETE', headers: h });
    if (r.ok) toast(`Deleted ${id} from the codex.`, 'info');
    else toast('Delete failed — Admin role required.', 'error');
    await load();
  };

  const uploadFile = async (file: File) => {
    const h = await authHeaders();
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/rag/upload', { method: 'POST', headers: h, body: form });
    if (r.ok) {
      const j = await r.json();
      toast(`Ingested ${j.added.length} document(s) into the codex — live on next dispatch.`, 'success');
      await load();
    } else toast(`Upload failed: ${(await r.json()).error || r.status}.`, 'error');
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cy" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">RAG Knowledge Base & Regulatory Codex</h3>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${backendLive ? 'bg-emerald-500/15 text-em' : 'bg-amber-500/15 text-am'}`}>{backendLive ? 'BACKEND LIVE · user-editable' : 'STATIC MIRROR'}</span>
          </div>
          <p className="text-xs text-muted mt-0.5">Edits here retrain agent context on the next dispatch cycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-faint absolute left-3 top-2.5" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search specs, rules, tags..." className="w-full bg-page border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-paper placeholder-faint focus:outline-none focus:border-cyan-500" />
          </div>
          <button onClick={() => admin && setEditing({ title: '', category: 'HISTORICAL_CASE', summary: '', content: '', relevanceTags: [] })} disabled={!admin} title={admin ? 'Add codex document' : 'Requires Admin org role'} className="px-2.5 py-1.5 text-xs font-medium text-onaccent bg-cyan-600 rounded-lg hover:bg-cyan-500 disabled:opacity-50 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add</button>
          {admin && (
            <label title="Upload .md/.txt/.json/.csv straight into the codex" className="px-2.5 py-1.5 text-xs font-medium text-cy bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 cursor-pointer flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />Upload
              <input type="file" accept=".md,.txt,.json,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${categoryFilter === cat ? 'bg-cyan-500/20 text-cy border border-cyan-500/40' : 'bg-raise/80 text-muted hover:text-paper'}`}>{cat.replace('_', ' ')}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredDocs.map((doc) => (
            <div key={doc.id} onClick={() => setSelectedId(doc.id)} className={`p-3 rounded-lg border cursor-pointer text-xs space-y-1.5 ${selectedId === doc.id ? 'bg-raise border-cyan-500/80' : 'bg-page/70 border-line hover:border-linestrong'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-cy font-bold">{doc.id}</span>
                <span className="flex items-center gap-1">
                  {admin && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ ...doc }); }} className="p-1 text-faint hover:text-cy"><Pencil className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); remove(doc.id); }} className="p-1 text-faint hover:text-ro"><Trash2 className="w-3 h-3" /></button>
                    </>
                  )}
                </span>
              </div>
              <h4 className="font-semibold text-paper line-clamp-1">{doc.title}</h4>
              <p className="text-[11px] text-muted line-clamp-2">{doc.summary}</p>
            </div>
          ))}
        </div>
        <div className="md:col-span-2 bg-page/90 border border-line rounded-xl p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {editing ? (
            <div className="space-y-3 text-xs">
              <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" className="w-full bg-panel border border-linestrong rounded px-3 py-2 text-paper" />
              <input value={editing.summary || ''} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} placeholder="Summary" className="w-full bg-panel border border-linestrong rounded px-3 py-2 text-paper" />
              <textarea value={editing.content || ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={8} placeholder="Full content — operating limits, rules, lessons" className="w-full bg-panel border border-linestrong rounded px-3 py-2 text-paper font-mono" />
              <input value={(editing.relevanceTags || []).join(', ')} onChange={(e) => setEditing({ ...editing, relevanceTags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="tags, comma-separated" className="w-full bg-panel border border-linestrong rounded px-3 py-2 text-paper font-mono" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-raise text-soft rounded flex items-center gap-1"><X className="w-3.5 h-3.5" />Cancel</button>
                <button onClick={saveEdit} className="px-3 py-1.5 bg-emerald-600 text-onaccent rounded flex items-center gap-1"><Save className="w-3.5 h-3.5" />Save to agent codex</button>
              </div>
            </div>
          ) : selectedDoc && (
            <>
              <span className="text-[11px] font-mono text-cy font-bold block">[{selectedDoc.id}] · {selectedDoc.category}</span>
              <h3 className="text-base font-semibold text-paper">{selectedDoc.title}</h3>
              <div className="text-xs text-muted">{selectedDoc.summary}</div>
              <pre className="text-xs font-mono text-paper whitespace-pre-wrap bg-panel/60 p-4 rounded-lg border border-line/80">{selectedDoc.content}</pre>
              <div className="flex flex-wrap gap-1.5">{selectedDoc.relevanceTags.map((tag) => (<span key={tag} className="px-2 py-0.5 rounded bg-raise text-soft font-mono text-[11px]">#{tag}</span>))}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
