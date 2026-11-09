import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Tooltip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCommentIcon from '@mui/icons-material/AddComment';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/client';
import type { Version, Comment, CommentStatus } from '../api/types';
import type { Anchor, Pin } from '../bridge-protocol';
import { sendToBridge } from '../bridge-protocol';
import { useThemeMode } from '../theme/ThemeModeContext';
import ShareProjectDialog from '../components/ShareProjectDialog';
import {
  CommentCard,
  ThreadDetail,
  FilterSeg,
  NewCommentComposer,
  normalizeDesignUrl,
  blockedHint,
  type Filter,
  type Sort,
  type BlockedInfo,
} from '../components/comments';

export default function PreviewPage() {
  const { t } = useTranslation();
  const { projectId, versionId } = useParams<{ projectId: string; versionId: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { tokens } = useThemeMode();

  const [version, setVersion] = useState<Version | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [role, setRole] = useState<'owner' | 'viewer'>('viewer');
  const [shareOpen, setShareOpen] = useState(false);
  const [blocked, setBlocked] = useState<Record<string, BlockedInfo>>({});
  const [guide, setGuide] = useState<BlockedInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const pinsRef = useRef<Pin[]>([]);
  const commentsRef = useRef<Comment[]>([]);

  const reload = useCallback(
    async (id: string) => {
      try {
        const cs = await api.listComments(id);
        setComments(cs);
        setLoadFailed(false);
      } catch (e) {
        setComments([]);
        setLoadFailed(true);
        setError(e instanceof Error ? e.message : t('preview.loadCommentsFailed'));
      }
    },
    [t],
  );

  // Load version metadata and the current user's project role.
  useEffect(() => {
    if (!projectId || !versionId) return;
    api
      .listVersions(projectId)
      .then((vs) => {
        const v = vs.find((x) => x.id === versionId);
        if (v) setVersion(v);
        else navigate(`/projects/${projectId}`);
      })
      .catch(() => navigate(`/projects/${projectId}`));
    api
      .getProject(projectId)
      .then((p) => setRole(p.role ?? 'viewer'))
      .catch(() => setRole('viewer'));
  }, [projectId, versionId, navigate]);

  // Load comments.
  useEffect(() => {
    if (versionId) reload(versionId);
  }, [versionId, reload]);

  // Listen for bridge messages (element anchor captures, navigation, ready).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // The bridge runs on the persona origin (a subdomain of our own host),
      // so accept our origin and any of its subdomains.
      let sameHost = false;
      try {
        const originHost = new URL(e.origin).hostname;
        sameHost =
          originHost === window.location.hostname ||
          originHost.endsWith('.' + window.location.hostname);
      } catch {
        // Invalid origin — leave sameHost false.
      }
      if (!sameHost) return;
      const d = e.data;
      if (!d || d.source !== 'uxer-bridge') return;
      if (d.type === 'anchor') {
        setPendingAnchor(d.anchor);
        setCommentMode(false);
      } else if (d.type === 'pin-click') {
        const clicked = commentsRef.current.find((c) => c.id === d.id) ?? null;
        if (clicked) {
          setDetailId(clicked.id);
          setCommentMode(false);
        }
      } else if (d.type === 'ready') {
        setCurrentUrl(typeof d.url === 'string' ? d.url : '');
        // The bridge (re)loaded: restore pins.
        if (pinsRef.current.length) {
          sendToBridge(iframeRef.current?.contentWindow ?? null, {
            source: 'uxer',
            type: 'pins',
            pins: pinsRef.current,
          });
        }
      } else if (d.type === 'location') {
        setCurrentUrl(typeof d.url === 'string' ? d.url : '');
      } else if (d.type === 'step-blocked') {
        const id = typeof d.id === 'string' ? d.id : null;
        if (id) {
          const info: BlockedInfo = {
            stepLabel: typeof d.stepLabel === 'string' ? d.stepLabel : undefined,
            reason: typeof d.reason === 'string' ? d.reason : undefined,
          };
          setBlocked((b) => ({ ...b, [id]: info }));
          setGuide(info);
        }
      } else if (d.type === 'step-reached') {
        const id = typeof d.id === 'string' ? d.id : null;
        if (id) {
          setBlocked((b) => {
            if (!(id in b)) return b;
            const rest = { ...b };
            delete rest[id];
            return rest;
          });
          setGuide(null);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Propagate mode changes into the iframe.
  useEffect(() => {
    sendToBridge(iframeRef.current?.contentWindow ?? null, {
      source: 'uxer',
      type: 'mode',
      mode: commentMode ? 'comment' : 'browse',
    });
  }, [commentMode]);

  // Derive pins from comments and push them into the iframe.
  const pins = useMemo<Pin[]>(() => {
    if (!comments) return [];
    return comments.map((c, i) => ({
      id: c.id,
      selector: c.selector,
      x: c.x,
      y: c.y,
      status: c.status,
      index: i + 1,
      url: normalizeDesignUrl(c.page_url) || '',
      step: c.step || '',
      state: c.state || '',
    }));
  }, [comments]);

  useEffect(() => {
    if (!comments) return;
    pinsRef.current = pins;
    commentsRef.current = comments;
    sendToBridge(iframeRef.current?.contentWindow ?? null, { source: 'uxer', type: 'pins', pins });
  }, [pins, comments]);

  const sendFocus = (
    selector: string,
    persist = false,
    step = '',
    id = '',
    state = '',
    text = '',
  ) => {
    sendToBridge(iframeRef.current?.contentWindow ?? null, {
      source: 'uxer',
      type: 'focus',
      selector,
      step,
      state,
      persist,
      id,
      text,
    });
  };

  const clearFocus = () => {
    sendToBridge(iframeRef.current?.contentWindow ?? null, {
      source: 'uxer',
      type: 'clear',
    });
  };

  const focusComment = (c: Comment, persist = false) => {
    setActiveId(c.id);
    // Clear any stale "blocked" flag: each attempt re-detects from scratch.
    setBlocked((b) => {
      if (!(c.id in b)) return b;
      const rest = { ...b };
      delete rest[c.id];
      return rest;
    });
    const target = normalizeDesignUrl(c.page_url);
    const step = c.step || '';
    const state = c.state || '';
    // No page URL recorded (legacy): just focus on the current page.
    if (!target) {
      sendFocus(c.selector, persist, step, c.id, state, c.text_excerpt);
      return;
    }
    // Already on the comment's page: just focus the element.
    if (currentUrl === target) {
      sendFocus(c.selector, persist, step, c.id, state, c.text_excerpt);
      return;
    }
    // Navigate the SPA client-side via the bridge (same origin). Deep links
    // aren't served by the origin (e.g. GitHub Pages), so a full reload would
    // 404. Cross-origin targets fall back to a full reload.
    const win = iframeRef.current?.contentWindow ?? null;
    let sameOrigin: boolean;
    try {
      sameOrigin = new URL(target).origin === new URL(version!.url).origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) {
      sendToBridge(win, {
        source: 'uxer',
        type: 'navigate',
        url: target,
        selector: c.selector,
        step,
        state,
        persist,
        id: c.id,
        text: c.text_excerpt,
      });
    } else {
      iframeRef.current!.src = `/proxy?url=${encodeURIComponent(target)}`;
    }
  };

  const openDetail = (c: Comment) => {
    setDetailId(c.id);
    // Exit comment mode when opening a thread so the hover highlight doesn't
    // override the persistent selection highlight.
    setCommentMode(false);
  };

  const submitComment = async (body: string) => {
    if (!pendingAnchor || !versionId || !body.trim()) return;
    try {
      const created = await api.createComment(versionId, {
        selector: pendingAnchor.selector,
        text_excerpt: pendingAnchor.text,
        page_url: normalizeDesignUrl(pendingAnchor.url || '') || version?.url || '',
        step: pendingAnchor.step || '',
        state: pendingAnchor.state || '',
        state_mode: pendingAnchor.stateMode || '',
        x: pendingAnchor.x,
        y: pendingAnchor.y,
        body: body.trim(),
      });
      setPendingAnchor(null);
      await reload(versionId);
      setFilter((f) => (f === 'resolved' ? 'open' : f));
      setActiveId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('preview.postCommentFailed'));
    }
  };

  const setStatus = async (c: Comment, status: CommentStatus) => {
    try {
      await api.updateComment(c.id, { status, resolved_version_id: versionId });
      await reload(versionId!);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('preview.updateCommentFailed'));
    }
  };

  const addReply = async (c: Comment, body: string) => {
    try {
      await api.createReply(c.id, body);
      await reload(versionId!);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('preview.postReplyFailed'));
    }
  };

  const deleteThread = async (c: Comment) => {
    try {
      await api.deleteComment(c.id);
      setDetailId(null);
      await reload(versionId!);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('preview.deleteCommentFailed'));
    }
  };

  const list = useMemo(() => comments ?? [], [comments]);
  const openCount = list.filter((c) => c.status === 'open').length;
  const resolvedCount = list.filter((c) => c.status === 'resolved').length;
  const counts: Record<Filter, number> = {
    open: openCount,
    resolved: resolvedCount,
    all: list.length,
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => filter === 'all' || c.status === filter)
      .filter(
        (c) =>
          !q ||
          [
            c.body,
            c.text_excerpt,
            c.author?.name ?? '',
            c.author?.email ?? '',
            ...(c.replies ?? []).map(
              (r) => `${r.body} ${r.author?.name ?? ''} ${r.author?.email ?? ''}`,
            ),
          ]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) =>
        sort === 'newest'
          ? +new Date(b.created_at) - +new Date(a.created_at)
          : +new Date(a.created_at) - +new Date(b.created_at),
      );
  }, [list, filter, query, sort]);

  const detail = list.find((c) => c.id === detailId) ?? null;
  const indexMap = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [list]);
  const indexOf = (id: string) => indexMap.get(id) ?? 0;
  const canManage = role === 'owner';
  const canResolve = role === 'owner' || role === 'viewer';

  // Keep the selected element highlighted while a thread is open; clear the
  // highlight when the thread closes.
  useEffect(() => {
    if (detail) {
      focusComment(detail, true);
    } else {
      clearFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  if (!version) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  const emptyTitle = query
    ? t('preview.emptySearchTitle')
    : loadFailed
      ? t('preview.emptyLoadFailedTitle')
      : filter === 'open'
        ? t('preview.emptyOpenTitle')
        : t('preview.emptyResolvedTitle');
  const emptySubtitle = query
    ? t('preview.emptySearchSubtitle')
    : loadFailed
      ? t('preview.emptyLoadFailedSubtitle')
      : t('preview.emptyDefaultSubtitle');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: tokens.canvas,
      }}
    >
      {/* Header */}
      <Box
        component="header"
        sx={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          borderBottom: 1,
          borderColor: tokens.surfaceBorder,
          bgcolor: tokens.surface,
        }}
      >
        <IconButton
          size="small"
          onClick={() => navigate(`/projects/${projectId}`)}
          aria-label={t('preview.backToVersions')}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" fontWeight={600}>
          v{version.seq}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0, flex: '1 1 auto' }}
        >
          {version.url}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {role === 'owner' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setShareOpen(true)}
              sx={{ minHeight: 34, px: 1.4, borderWidth: 2, fontSize: 14, whiteSpace: 'nowrap' }}
            >
              {t('common.share')}
            </Button>
          )}
          <Box
            component="span"
            sx={{
              borderRadius: 999,
              bgcolor: tokens.openSoft,
              color: tokens.open,
              px: 1.25,
              py: 0.25,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {t('preview.openBadge', { count: openCount })}
          </Box>
          <Tooltip title={detail !== null ? t('preview.exitThreadTooltip') : ''} placement="bottom">
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <Button
                size="small"
                disabled={detail !== null}
                onClick={() => {
                  setCommentMode((m) => !m);
                  setPendingAnchor(null);
                }}
                startIcon={<AddCommentIcon sx={{ fontSize: 16 }} />}
                sx={{
                  border: '1px solid',
                  borderColor: tokens.ink,
                  bgcolor: tokens.ink,
                  color: '#ffffff',
                  px: 1.5,
                  py: 0.75,
                  fontSize: 14,
                  fontWeight: 500,
                  '&:hover': { bgcolor: tokens.ink },
                  '&.Mui-disabled': {
                    color: 'text.disabled',
                    borderColor: 'divider',
                    bgcolor: 'transparent',
                  },
                }}
              >
                {commentMode ? t('preview.clickToComment') : t('preview.commentMode')}
              </Button>
            </Box>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexGrow: 1,
          minHeight: 0,
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        {/* Preview */}
        <Box
          sx={{
            flexGrow: 1,
            position: 'relative',
            bgcolor: tokens.canvas,
            minHeight: { xs: '40vh', md: 0 },
          }}
        >
          <iframe
            ref={iframeRef}
            src={`/proxy?url=${encodeURIComponent(version.url)}`}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title={t('preview.designPreviewTitle')}
          />
        </Box>

        {/* Comments panel */}
        <Box
          component="aside"
          sx={{
            width: { xs: '100%', md: 380 },
            flexShrink: 0,
            flexGrow: { xs: 1, md: 0 },
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: { xs: 0, md: 1 },
            borderTop: { xs: 1, md: 0 },
            borderColor: tokens.surfaceBorder,
            bgcolor: tokens.surface,
          }}
        >
          {detail ? (
            <ThreadDetail
              key={detail.id}
              comment={detail}
              index={indexOf(detail.id)}
              canManage={canManage}
              canResolve={canResolve}
              blockedInfo={blocked[detail.id]}
              onBack={() => setDetailId(null)}
              onReply={(body) => addReply(detail, body)}
              onToggle={() => setStatus(detail, detail.status === 'open' ? 'resolved' : 'open')}
              onDelete={() => deleteThread(detail)}
            />
          ) : (
            <>
              {/* Panel header */}
              <Box
                sx={{
                  p: 2,
                  borderBottom: 1,
                  borderColor: tokens.surfaceBorder,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={600}>
                    {t('preview.comments')}
                  </Typography>
                  <Box
                    component="select"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    sx={{
                      border: 'none',
                      bgcolor: 'transparent',
                      color: 'text.secondary',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    <option value="newest">{t('preview.newestFirst')}</option>
                    <option value="oldest">{t('preview.oldestFirst')}</option>
                  </Box>
                </Box>

                <FilterSeg value={filter} onChange={setFilter} counts={counts} />

                <Box
                  component="label"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 0.75,
                    '&:focus-within': {
                      borderColor: 'primary.main',
                      boxShadow: '0 0 0 2px rgba(15, 23, 43, 0.12)',
                    },
                  }}
                >
                  <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Box
                    component="input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('preview.searchComments')}
                    sx={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: 14,
                      color: 'text.primary',
                      '::placeholder': { color: 'text.secondary', opacity: 0.8 },
                    }}
                  />
                  {query && (
                    <IconButton
                      size="small"
                      onClick={() => setQuery('')}
                      aria-label={t('preview.clearSearch')}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              </Box>

              {pendingAnchor && (
                <NewCommentComposer
                  excerpt={pendingAnchor.text}
                  onCancel={() => setPendingAnchor(null)}
                  onSubmit={submitComment}
                />
              )}

              {/* Comment list */}
              <Box
                sx={{
                  flexGrow: 1,
                  overflowY: 'auto',
                  bgcolor: tokens.canvas,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {comments === null ? (
                  <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress />
                  </Box>
                ) : visible.length === 0 ? (
                  <Box sx={{ px: 3, py: 8, textAlign: 'center' }}>
                    <Typography variant="body2" fontWeight={600}>
                      {emptyTitle}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5, display: 'block' }}
                    >
                      {emptySubtitle}
                    </Typography>
                  </Box>
                ) : (
                  visible.map((c) => (
                    <CommentCard
                      key={c.id}
                      comment={c}
                      index={indexOf(c.id)}
                      active={activeId === c.id}
                      canResolve={canResolve}
                      blockedInfo={blocked[c.id]}
                      onOpen={() => openDetail(c)}
                      onToggle={() => setStatus(c, c.status === 'open' ? 'resolved' : 'open')}
                    />
                  ))
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Snackbar
        open={error !== null}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" variant="filled">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={guide !== null}
        autoHideDuration={6000}
        onClose={() => setGuide(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setGuide(null)} severity="warning" variant="filled">
          {guide && blockedHint(t, guide)}
        </Alert>
      </Snackbar>

      {projectId && (
        <ShareProjectDialog
          open={shareOpen}
          projectId={projectId}
          onClose={() => setShareOpen(false)}
        />
      )}
    </Box>
  );
}
