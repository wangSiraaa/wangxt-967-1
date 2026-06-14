import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { run, query, queryOne } from '../database.js';
import { authMiddleware, adminMiddleware, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

class SeededRandom {
  private seed: number;

  constructor(seed?: string) {
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      this.seed = Math.abs(hash);
    } else {
      this.seed = Date.now() + Math.floor(Math.random() * 1000000);
    }
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  getSeed(): string {
    return this.seed.toString();
  }
}

function fisherYatesShuffle<T>(arr: T[], rng: SeededRandom): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getPriorityWeight(priorityType: string | null | undefined): number {
  const weights: Record<string, number> = {
    disabled: 3,
    veteran: 2.5,
    old_merchant: 2,
    none: 1,
  };
  return weights[priorityType || 'none'] || 1;
}

function getPriorityLabel(priorityType: string | null | undefined): string {
  const labels: Record<string, string> = {
    disabled: '残障优先',
    veteran: '退役军人优先',
    old_merchant: '老商户优先',
    none: '普通',
  };
  return labels[priorityType || 'none'] || '普通';
}

interface RegistrationWithPriority {
  id: number;
  batch_id: number;
  user_id: number;
  merchant_name: string;
  contact_person: string;
  phone: string;
  category: string;
  license_no: string;
  license_expiry: string;
  license_image: string;
  food_license_no: string | null;
  food_license_expiry: string | null;
  food_license_image: string | null;
  priority_type: string | null;
  priority_materials: string | null;
  priority_review_status: string;
  priority_review_opinion: string | null;
  need_adjacent: number;
  adjacent_count: number;
  adjacent_approved: number;
  status: string;
  reject_reason: string | null;
  review_opinion: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function findAdjacentGroups(stallNumbers: string[]): string[][] {
  const groups: string[][] = [];
  if (stallNumbers.length === 0) return groups;

  const sorted = [...stallNumbers].sort();
  let currentGroup: string[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevNum = parseInt(prev.replace(/\D/g, ''), 10) || 0;
    const currNum = parseInt(curr.replace(/\D/g, ''), 10) || 0;
    const prevPrefix = prev.replace(/\d/g, '');
    const currPrefix = curr.replace(/\d/g, '');

    if (prevPrefix === currPrefix && currNum === prevNum + 1) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);
  return groups;
}

function getCategoryCounts(registrations: RegistrationWithPriority[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of registrations) {
    counts[r.category] = (counts[r.category] || 0) + 1;
  }
  return counts;
}

function weightedShuffle<T extends { weight: number }>(arr: T[], rng: SeededRandom): T[] {
  const result: T[] = [];
  const remaining = [...arr];

  while (remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let random = rng.next() * totalWeight;

    let selectedIndex = 0;
    for (let i = 0; i < remaining.length; i++) {
      random -= remaining[i].weight;
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    result.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }

  return result;
}

function normalizeRegistration(r: RegistrationWithPriority | Record<string, unknown>): RegistrationWithPriority {
  return {
    ...r as RegistrationWithPriority,
    priority_type: (r as RegistrationWithPriority).priority_type || 'none',
    priority_materials: (r as RegistrationWithPriority).priority_materials || null,
    priority_review_status: (r as RegistrationWithPriority).priority_review_status || 'pending',
    priority_review_opinion: (r as RegistrationWithPriority).priority_review_opinion || null,
    need_adjacent: Number((r as RegistrationWithPriority).need_adjacent) || 0,
    adjacent_count: Number((r as RegistrationWithPriority).adjacent_count) || 2,
    adjacent_approved: Number((r as RegistrationWithPriority).adjacent_approved) || 0,
  };
}

router.post('/execute/:batchId', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status === 'published') {
      res.status(400).json({ success: false, error: '已发布的结果不可修改' });
      return;
    }

    const approved = query(
      'SELECT * FROM registrations WHERE batch_id = ? AND status = ?',
      [batchId, 'approved']
    ).map(normalizeRegistration);

    if (approved.length === 0) {
      res.status(400).json({ success: false, error: '该批次没有已审核通过的报名' });
      return;
    }

    let stallNumbers: string[];
    try {
      stallNumbers = JSON.parse(batch.stall_numbers as string);
    } catch {
      stallNumbers = [];
    }

    if (stallNumbers.length === 0) {
      res.status(400).json({ success: false, error: '该批次没有可用摊位' });
      return;
    }

    const concentrationLimit = (batch.category_concentration_limit as number) || 0.3;
    const categoryCounts = getCategoryCounts(approved);
    const maxPerCategory = Math.max(1, Math.floor(stallNumbers.length * concentrationLimit));

    const rng = new SeededRandom();
    const seed = rng.getSeed();

    const adjacentRequesters = approved.filter(r => r.need_adjacent === 1 && r.adjacent_count > 0);
    const singleRequesters = approved.filter(r => r.need_adjacent === 0 || r.adjacent_count <= 0);

    const adjGroups = findAdjacentGroups(stallNumbers);
    let availableStalls = [...stallNumbers];
    const assignedResults: Array<{ registration: RegistrationWithPriority; stallNumber: string; reason: string }> = [];
    const downgraded: number[] = [];

    const adjWithWeight = adjacentRequesters.map(r => ({
      registration: r,
      weight: getPriorityWeight(r.priority_type),
    }));
    const adjSorted = weightedShuffle(adjWithWeight, rng).map(x => x.registration);

    for (const reg of adjSorted) {
      const needed = reg.adjacent_count || 2;
      const suitableGroups = adjGroups.filter(g =>
        g.length >= needed && g.every(s => availableStalls.includes(s))
      );

      if (suitableGroups.length > 0) {
        const shuffledGroups = fisherYatesShuffle(suitableGroups, rng);
        const chosenGroup = shuffledGroups[0];
        const startIdx = rng.nextInt(0, chosenGroup.length - needed);
        const chosenStalls = chosenGroup.slice(startIdx, startIdx + needed);

        for (let i = 0; i < chosenStalls.length; i++) {
          const stall = chosenStalls[i];
          const idx = availableStalls.indexOf(stall);
          if (idx > -1) availableStalls.splice(idx, 1);
        }

        const priorityDesc = reg.priority_type && reg.priority_type !== 'none'
          ? `，${getPriorityLabel(reg.priority_type)}`
          : '';
        assignedResults.push({
          registration: reg,
          stallNumber: chosenStalls[0],
          reason: `连摊分配（共${needed}个：${chosenStalls.join('、')}）${priorityDesc}`,
        });

        run(
          'UPDATE registrations SET adjacent_approved = 1 WHERE id = ?',
          [reg.id]
        );
      } else {
        downgraded.push(reg.id);
        singleRequesters.push(reg);
      }
    }

    const singleWithWeight = singleRequesters.map(r => ({
      registration: r,
      weight: getPriorityWeight(r.priority_type),
    }));

    const selectedSingle: RegistrationWithPriority[] = [];
    const notSelected: RegistrationWithPriority[] = [];
    const currentCategoryCounts: Record<string, number> = {};
    const assignedCategories = [...assignedResults.map(a => a.registration.category)];
    for (const cat of assignedCategories) {
      currentCategoryCounts[cat] = (currentCategoryCounts[cat] || 0) + 1;
    }

    const weightedSingle = weightedShuffle(singleWithWeight, rng);

    for (const { registration } of weightedSingle) {
      const cat = registration.category;
      const currentCount = currentCategoryCounts[cat] || 0;

      if (selectedSingle.length >= availableStalls.length) {
        notSelected.push(registration);
        continue;
      }

      if (currentCount >= maxPerCategory) {
        notSelected.push(registration);
        continue;
      }

      selectedSingle.push(registration);
      currentCategoryCounts[cat] = currentCount + 1;
    }

    if (selectedSingle.length < availableStalls.length && notSelected.length > 0) {
      const remainingSlots = availableStalls.length - selectedSingle.length;
      const shuffledRemaining = fisherYatesShuffle(notSelected, rng);
      const extra = shuffledRemaining.slice(0, remainingSlots);
      for (const reg of extra) {
        selectedSingle.push(reg);
        const idx = notSelected.indexOf(reg);
        if (idx > -1) notSelected.splice(idx, 1);
      }
    }

    const shuffledStalls = fisherYatesShuffle(availableStalls, rng);
    for (let i = 0; i < selectedSingle.length && i < shuffledStalls.length; i++) {
      const reg = selectedSingle[i];
      const stall = shuffledStalls[i];
      let reason = '随机抽签分配';

      if (reg.priority_type && reg.priority_type !== 'none') {
        reason += `（${getPriorityLabel(reg.priority_type)}）`;
      }
      if (downgraded.includes(reg.id)) {
        reason += '；连摊申请因相邻摊位不足已降级为单摊';
      }

      assignedResults.push({ registration: reg, stallNumber: stall, reason });
    }

    run('DELETE FROM lottery_results WHERE batch_id = ?', [batchId]);

    for (const result of assignedResults) {
      run(
        `INSERT INTO lottery_results
          (batch_id, registration_id, stall_number, is_published, draw_reason)
         VALUES (?, ?, ?, 0, ?)`,
        [batchId, result.registration.id, result.stallNumber, result.reason]
      );
    }

    run(
      "UPDATE batches SET status = 'lottery_done', random_seed = ? WHERE id = ?",
      [seed, batchId]
    );

    const results = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no,
              r.priority_type, r.need_adjacent, r.adjacent_count, r.adjacent_approved
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       WHERE lr.batch_id = ?
       ORDER BY lr.stall_number`,
      [batchId]
    );

    res.json({
      success: true,
      data: {
        seed,
        results,
        stats: {
          total_applicants: approved.length,
          total_stalls: stallNumbers.length,
          selected_count: assignedResults.length,
          not_selected_count: notSelected.length,
          adjacent_downgraded: downgraded.length,
          category_concentration_limit: concentrationLimit,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/results/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    const authHeader = req.headers.authorization;
    let isAdmin = false;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { role: string };
        isAdmin = decoded.role === 'admin';
      } catch {
        isAdmin = false;
      }
    }

    if (batch.status !== 'published' && !isAdmin && batch.status !== 'voided') {
      res.status(403).json({ success: false, error: '该批次抽签结果尚未发布' });
      return;
    }

    const publishedFilter = batch.status === 'published' && !isAdmin ? 'AND lr.is_published = 1' : '';
    const voidFilter = batch.status !== 'voided' ? 'AND lr.is_void = 0' : '';

    const rawResults = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no,
              r.priority_type, r.need_adjacent, r.adjacent_count, r.adjacent_approved
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       WHERE lr.batch_id = ? ${publishedFilter} ${voidFilter}
       ORDER BY lr.stall_number`,
      [batchId]
    );

    const results = rawResults.map(r => ({
      ...r,
      is_published: Number(r.is_published) || 0,
      draw_reason: r.draw_reason || '历史抽签分配',
      is_void: Number(r.is_void) || 0,
      void_reason: r.void_reason || null,
      priority_type: r.priority_type || 'none',
      need_adjacent: Number(r.need_adjacent) || 0,
      adjacent_count: Number(r.adjacent_count) || 2,
      adjacent_approved: Number(r.adjacent_approved) || 0,
    }));

    const appeals = query(
      `SELECT a.*, r.merchant_name
       FROM appeals a
       LEFT JOIN registrations r ON a.registration_id = r.id
       WHERE a.batch_id = ?
       ORDER BY a.created_at DESC`,
      [batchId]
    );

    res.json({
      success: true,
      data: {
        batch,
        results,
        appeals,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/results', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no,
              r.priority_type, r.need_adjacent, r.adjacent_count, r.adjacent_approved,
              b.name as batch_name, b.status as batch_status
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       LEFT JOIN batches b ON lr.batch_id = b.id
       WHERE lr.is_published = 1 AND lr.is_void = 0 AND b.status = 'published'
       ORDER BY lr.batch_id, lr.stall_number`
    );

    const results = raw.map(r => ({
      ...r,
      is_published: Number((r as Record<string, unknown>).is_published) || 0,
      draw_reason: (r as Record<string, unknown>).draw_reason as string || '历史抽签分配',
      is_void: Number((r as Record<string, unknown>).is_void) || 0,
      void_reason: (r as Record<string, unknown>).void_reason as string || null,
      priority_type: (r as Record<string, unknown>).priority_type as string || 'none',
      need_adjacent: Number((r as Record<string, unknown>).need_adjacent) || 0,
      adjacent_count: Number((r as Record<string, unknown>).adjacent_count) || 2,
      adjacent_approved: Number((r as Record<string, unknown>).adjacent_approved) || 0,
    }));

    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/publish/:batchId', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;
    const { appeal_deadline } = req.body;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status !== 'lottery_done') {
      res.status(400).json({ success: false, error: '批次尚未完成抽签，无法发布' });
      return;
    }

    const now = new Date().toISOString().replace('T', ' ').split('.')[0];

    run('UPDATE lottery_results SET is_published = 1 WHERE batch_id = ?', [batchId]);
    run(
      "UPDATE batches SET status = 'published', published_at = ?, appeal_deadline = ? WHERE id = ?",
      [now, appeal_deadline ?? null, batchId]
    );

    res.json({ success: true, data: { message: '抽签结果已发布公示', published_at: now } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/explanation/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    const authHeader = req.headers.authorization;
    let isAdmin = false;
    let userId: number | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { role: string; id: number };
        isAdmin = decoded.role === 'admin';
        userId = decoded.id;
      } catch {
        isAdmin = false;
      }
    }

    const isPublished = batch.status === 'published' || batch.status === 'voided';
    if (!isPublished && !isAdmin) {
      res.status(403).json({ success: false, error: '该批次抽签结果尚未发布' });
      return;
    }

    const allRegistrations = query(
      'SELECT * FROM registrations WHERE batch_id = ? AND status = ?',
      [batchId, 'approved']
    ).map(normalizeRegistration);

    const rawResults = query(
      `SELECT lr.*, r.merchant_name, r.category, r.priority_type, r.need_adjacent, r.adjacent_approved
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       WHERE lr.batch_id = ? AND lr.is_void = 0
       ORDER BY lr.stall_number`,
      [batchId]
    );

    const results = rawResults.map(r => ({
      ...r,
      registration_id: Number(r.registration_id),
      stall_number: r.stall_number,
      merchant_name: r.merchant_name,
      category: r.category,
      draw_reason: r.draw_reason || '历史抽签分配',
      priority_type: r.priority_type || 'none',
      need_adjacent: Number(r.need_adjacent) || 0,
      adjacent_approved: Number(r.adjacent_approved) || 0,
    }));

    const selectedIds = new Set(results.map(r => r.registration_id));
    const notSelected = allRegistrations.filter(r => !selectedIds.has(r.id));

    const notSelectedWithReason = notSelected.map(r => {
      const reasons: string[] = [];

      if (r.need_adjacent === 1 && r.adjacent_approved === 0) {
        reasons.push('连摊申请因相邻摊位不足降级后仍未中签');
      }

      const categoryCounts = getCategoryCounts(allRegistrations);
      const totalStalls = (batch.stall_count as number) || 0;
      const limit = Math.max(1, Math.floor(totalStalls * (((batch as Record<string, unknown>).category_concentration_limit as number) || 0.3)));
      if ((categoryCounts[r.category] || 0) > limit) {
        reasons.push(`同品类（${r.category}）报名人数较多，受品类集中度限制`);
      }

      if (reasons.length === 0) {
        reasons.push('随机抽签未中');
      }

      return {
        id: r.id,
        merchant_name: r.merchant_name,
        category: r.category,
        priority_type: r.priority_type,
        need_adjacent: r.need_adjacent,
        reason: reasons.join('；'),
      };
    });

    let stallNumbers: string[] = [];
    try {
      stallNumbers = JSON.parse(batch.stall_numbers as string);
    } catch {
      stallNumbers = [];
    }

    const normBatch = batch as Record<string, unknown>;
    res.json({
      success: true,
      data: {
        batch_info: {
          id: batch.id,
          name: batch.name,
          status: batch.status,
          total_stalls: stallNumbers.length,
          total_applicants: allRegistrations.length,
          selected_count: results.length,
          not_selected_count: notSelected.length,
          random_seed: normBatch.random_seed || null,
          published_at: normBatch.published_at || null,
          appeal_deadline: normBatch.appeal_deadline || null,
          category_concentration_limit: (normBatch.category_concentration_limit as number) || 0.3,
          correction_note: normBatch.correction_note || null,
        },
        selected: results,
        not_selected: notSelectedWithReason,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
