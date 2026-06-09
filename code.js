/**
 * Figma Plugin: Fresh Start
 *
 * 功能模块：
 * - removeHidden: 删除隐藏元素
 * - autoLayout: 智能应用 Auto Layout
 * - smartRename: 智能重命名
 * - flattenStructure: 展平结构
 */

// ==================== Utils ====================

/**
 * 检查节点是否有效（存在且有父节点）
 */
function isNodeValid(node) {
  if (!node) return false;
  try {
    return node.parent !== null;
  } catch (e) {
    return false;
  }
}

/**
 * 获取节点相对于画布的绝对位置
 */
function getAbsolutePosition(node) {
  try {
    const transform = node.absoluteTransform;
    return {
      x: transform[0][2],
      y: transform[1][2]
    };
  } catch (e) {
    return { x: 0, y: 0 };
  }
}

function getNodeArea(node) {
  try {
    const w = typeof node.width === 'number' ? node.width : 0;
    const h = typeof node.height === 'number' ? node.height : 0;
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return 0;
    return w * h;
  } catch (e) {
    return 0;
  }
}

const I18N = {
  en: {
    selectFirst: 'Please select a Frame or Group first',
    hiddenRemoved: 'Hidden elements removed!',
    outsideElementsRemoved: 'Outside-container elements removed! ({count})',
    renamed: 'Elements renamed!',
    autoLayoutRemoved: 'Auto Layout removed!',
    groupsConverted: 'Groups converted! ({count})',
    shapeStyleApplied: 'Shape style applied! ({applied}), masks removed! ({removed})',
    noValidContainer: 'No valid container selected',
    majorColorNA: 'Major color: N/A',
    majorColorValue: 'Major color: rgba({r}, {g}, {b}, {a})',
    structureFlattened: 'Structure flattened!',
    groupedInto: 'Grouped into {count} frame(s)!',
    noRelations: 'No row/column relations found',
    createdRelations: 'Created {count} relation frame(s)',
    createdWrap: 'Created {count} wrap frame(s)',
    noWrap: 'No wrap created',
    convertedRelationsWrap: 'Converted! relation frames: {relation}, wrap frames: {wrap}',
    convertedGroups: 'Converted groups: {count}',
    appliedCleaned: 'Applied & cleaned! ungrouped frames: {count}',
    convertedContainers: 'Converted container frames: {count}',
    alDone: 'AL done! relation frames: {relation}, wrap frames: {wrap}, containers: {containers}, groups: {groups}, ungrouped: {ungrouped}',
    step1Done: 'Step 1 completed: Cleaned & renamed',
    step2Done: 'Step 2 completed: Optimized & auto layout applied',
    moduleRemoveInvisibleDone: 'Remove invisible cleanup done',
    overlapImagesRemoved: 'Overlapped images removed! ({count})',
    moduleSmartRenameDone: 'Smart rename completed',
    moduleFlattenStructureDone: 'Structure optimized',
    moduleGroupElementsDone: 'Auto layout applied'
  },
  zh: {
    selectFirst: '请先选择一个 Frame 或 Group',
    hiddenRemoved: '已删除不可见元素',
    outsideElementsRemoved: '已删除容器区域外元素（{count}）',
    renamed: '已完成重命名',
    autoLayoutRemoved: '已移除 Auto Layout',
    groupsConverted: '已转换 Groups（{count}）',
    shapeStyleApplied: '已上移形状样式（{applied}），已移除遮罩（{removed}）',
    noValidContainer: '未选择有效容器',
    majorColorNA: '主色：无',
    majorColorValue: '主色：rgba({r}, {g}, {b}, {a})',
    structureFlattened: '结构已优化',
    groupedInto: '已生成关系框：{count}',
    noRelations: '未发现行/列关系',
    createdRelations: '已生成关系框：{count}',
    createdWrap: '已生成包裹框：{count}',
    noWrap: '未生成包裹框',
    convertedRelationsWrap: '已转换：关系框 {relation}，包裹框 {wrap}',
    convertedGroups: '已转换 Groups：{count}',
    appliedCleaned: '已应用并清理：解散 {count} 个中间 Frame',
    convertedContainers: '已转换容器 Frame：{count}',
    alDone: '完成：关系框 {relation}，包裹框 {wrap}，容器 {containers}，Groups {groups}，解散 {ungrouped}',
    step1Done: '步骤一完成：已清理并重命名',
    step2Done: '步骤二完成：已优化并应用自动布局',
    moduleRemoveInvisibleDone: '清理完成',
    overlapImagesRemoved: '已清理重叠图片（{count}）',
    moduleSmartRenameDone: '已完成智能重命名',
    moduleFlattenStructureDone: '已优化结构层级',
    moduleGroupElementsDone: '已应用自动布局'
  }
};

function normalizeLang(lang) {
  return lang === 'zh' ? 'zh' : 'en';
}

function tr(key, lang, vars = {}) {
  const l = normalizeLang(lang);
  const table = I18N[l] || I18N.en;
  const template = (table && table[key]) || (I18N.en && I18N.en[key]) || '';
  return String(template).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? '' : String(v);
  });
}

// ==================== Remove Hidden ====================

/**
 * 检查节点是否完全透明（opacity === 0）
 */
function isFullyTransparent(node) {
  return node.opacity === 0;
}

function hasOnlyInvisibleFills(node) {
  if (!node || !isNodeValid(node)) return false;
  try {
    if (!('fills' in node)) return false;
    const fills = node.fills;
    if (!fills || fills === figma.mixed || !Array.isArray(fills) || fills.length === 0) return false;
    if (hasVisiblePaints(fills)) return false;

    try {
      if ('strokes' in node && hasVisiblePaints(node.strokes)) return false;
    } catch (e) {
    }

    try {
      if ('children' in node && Array.isArray(node.children) && node.children.length > 0) return false;
    } catch (e) {
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 删除所有隐藏元素（visible === false 或 opacity === 0）
 */
function removeHiddenElements(node) {
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child))
      continue;
    // 删除隐藏元素或完全透明的元素
    if (child.visible === false || isFullyTransparent(child) || hasOnlyInvisibleFills(child)) {
      child.remove();
      continue;
    }
    // 递归处理子容器
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      removeHiddenElements(child);
    }
  }
}

function getAbsoluteRect(node) {
  try {
    const bb = node.absoluteBoundingBox;
    if (bb && typeof bb.x === 'number' && typeof bb.y === 'number') {
      return { x: bb.x, y: bb.y, width: bb.width || 0, height: bb.height || 0 };
    }
  } catch (e) {
  }

  const abs = getAbsolutePosition(node);
  const width = typeof node.width === 'number' ? node.width : 0;
  const height = typeof node.height === 'number' ? node.height : 0;
  return { x: abs.x, y: abs.y, width, height };
}

function rectsIntersect(a, b, eps = 1e-6) {
  if (!a || !b) return false;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return ax2 > b.x + eps && bx2 > a.x + eps && ay2 > b.y + eps && by2 > a.y + eps;
}

function isImageNode(node) {
  if (!node || !isNodeValid(node)) return false;
  if (node.visible === false) return false;
  try {
    if (!('fills' in node)) return false;
    const fills = node.fills;
    if (!fills || !Array.isArray(fills)) return false;
    for (const fill of fills) {
      if (!fill || fill.visible === false) continue;
      if (fill.type === 'IMAGE') return true;
    }
  } catch (e) {
  }
  return false;
}

function pruneOverlappedImagesInContainer(container) {
  if (!container || !isNodeValid(container) || !('children' in container)) return 0;
  if (container.locked) return 0;
  if (container.type === 'INSTANCE' || hasInstanceAncestor(container)) return 0;

  let removed = 0;
  const childrenSnapshot = container.children ? [...container.children] : [];

  const imageChildren = [];
  for (const child of childrenSnapshot) {
    if (!isNodeValid(child)) continue;
    if (child.locked) continue;
    if (child.type === 'INSTANCE' || hasInstanceAncestor(child)) continue;
    if (isImageNode(child)) imageChildren.push(child);
  }

  if (imageChildren.length >= 2) {
    let topImage = null;
    for (let i = childrenSnapshot.length - 1; i >= 0; i--) {
      const c = childrenSnapshot[i];
      if (!isNodeValid(c)) continue;
      if (isImageNode(c)) {
        topImage = c;
        break;
      }
    }

    if (topImage && isNodeValid(topImage)) {
      const containerRect = getAbsoluteRect(container);
      const topRect = getAbsoluteRect(topImage);
      const sizeEps = 0.5;
      const coversContainer =
        topRect.width + sizeEps >= containerRect.width &&
        topRect.height + sizeEps >= containerRect.height &&
        rectsIntersect(topRect, containerRect);

      if (coversContainer) {
        let allOverlap = true;
        for (const img of imageChildren) {
          if (img === topImage) continue;
          if (!isNodeValid(img)) continue;
          const r = getAbsoluteRect(img);
          if (!rectsIntersect(topRect, r)) {
            allOverlap = false;
            break;
          }
        }

        if (allOverlap) {
          for (const img of imageChildren) {
            if (img === topImage) continue;
            if (!isNodeValid(img)) continue;
            try {
              img.remove();
              removed++;
            } catch (e) {
            }
          }
        }
      }
    }
  }

  for (const child of childrenSnapshot) {
    if (!isNodeValid(child)) continue;
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      removed += pruneOverlappedImagesInContainer(child);
    }
  }

  return removed;
}

function rectHasArea(rect) {
  return !!rect && typeof rect.width === 'number' && typeof rect.height === 'number' && rect.width > 0 && rect.height > 0;
}

function pruneOutsideElementsInContainer(container) {
  if (!container || !isNodeValid(container) || !('children' in container)) return 0;
  if (container.locked) return 0;
  if (container.type === 'INSTANCE' || hasInstanceAncestor(container)) return 0;

  const containerRect = getAbsoluteRect(container);
  if (!rectHasArea(containerRect)) return 0;

  let removed = 0;
  const childrenSnapshot = container.children ? [...container.children] : [];
  for (const child of childrenSnapshot) {
    if (!isNodeValid(child)) continue;
    if (child.locked) continue;
    if (child.type === 'INSTANCE' || hasInstanceAncestor(child)) continue;

    const childRect = getAbsoluteRect(child);
    if (rectHasArea(childRect) && !rectsIntersect(containerRect, childRect)) {
      try {
        child.remove();
        removed++;
      } catch (e) {
      }
      continue;
    }

    if (child.type === 'GROUP' || child.type === 'FRAME') {
      removed += pruneOutsideElementsInContainer(child);
    }
  }

  return removed;
}

// ==================== Flatten Structure ====================

/**
 * 检查 Frame 是否包含图片元素
 */
function containsImage(node) {
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child)) continue;
    
    // 检查是否是图片矩形
    if (child.type === 'RECTANGLE') {
      const fills = child.fills;
      if (fills && Array.isArray(fills) && fills.length > 0) {
        if (fills[0].type === 'IMAGE') {
          return true;
        }
      }
    }
    
    // 递归检查子容器
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      if (containsImage(child)) {
        return true;
      }
    }
  }
  return false;
}

function containsDirectImage(node) {
  if (!node || !node.children) return false;
  const nodeW = typeof node.width === 'number' ? node.width : 0;
  const nodeH = typeof node.height === 'number' ? node.height : 0;
  if (!isFinite(nodeW) || !isFinite(nodeH) || nodeW <= 0 || nodeH <= 0) return false;

  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child)) continue;
    const childW = typeof child.width === 'number' ? child.width : 0;
    const childH = typeof child.height === 'number' ? child.height : 0;
    if (!isFinite(childW) || !isFinite(childH) || childW <= 0 || childH <= 0) continue;

    try {
      if ('fills' in child) {
        const fills = child.fills;
        const hasImageFill = (() => {
          if (fills === figma.mixed) return true;
          if (!fills || !Array.isArray(fills)) return false;
          for (const fill of fills) {
            if (fill && fill.visible !== false && fill.type === 'IMAGE') return true;
          }
          return false;
        })();

        if (hasImageFill && nodeW <= childW && nodeH <= childH) {
          return true;
        }
      }
    } catch (e) {
    }
  }

  return false;
}

/**
 * 检查 Frame 是否有填充颜色
 */
function hasFillColor(node) {
  const fills = node.fills;
  if (fills && Array.isArray(fills) && fills.length > 0) {
    // 检查是否有可见的填充
    for (const fill of fills) {
      if (fill.visible !== false) {
        if (fill.type === 'SOLID' || fill.type === 'GRADIENT_LINEAR' ||
          fill.type === 'GRADIENT_RADIAL' || fill.type === 'GRADIENT_ANGULAR' ||
          fill.type === 'GRADIENT_DIAMOND' || fill.type === 'IMAGE') {
          return true;
        }
      }
    }
  }
  return false;
}

function getFirstVisibleSolidFillColor(node) {
  try {
    if (!node || !('fills' in node)) return null;
    const fills = node.fills;
    if (!fills || !Array.isArray(fills)) return null;
    for (const fill of fills) {
      if (!fill || fill.visible === false) continue;
      if (fill.type !== 'SOLID') continue;
      const c = fill.color;
      if (!c) continue;
      const a1 = typeof c.a === 'number' ? c.a : 1;
      const a2 = typeof fill.opacity === 'number' ? fill.opacity : 1;
      return { r: c.r, g: c.g, b: c.b, a: a1 * a2 };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function isSameRGBA(c1, c2, eps = 1e-3) {
  if (!c1 || !c2) return false;
  return (
    Math.abs(c1.r - c2.r) <= eps &&
    Math.abs(c1.g - c2.g) <= eps &&
    Math.abs(c1.b - c2.b) <= eps &&
    Math.abs(c1.a - c2.a) <= eps
  );
}

function detectMajorColor(root) {
  const maxNodes = 5000;
  const queue = [root];
  const visited = new Set();
  const buckets = new Map();
  let processed = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    processed++;
    if (processed > maxNodes) break;

    try {
      if (node.type !== 'TEXT') {
        const isMask = 'isMask' in node && node.isMask === true;
        if (!isMask) {
          const c = getFirstVisibleSolidFillColor(node);
          if (c) {
            const area = typeof node.width === 'number' && typeof node.height === 'number' ? Math.max(0, node.width) * Math.max(0, node.height) : 0;
            if (area > 0) {
              const key = `${Math.round(c.r * 255)}_${Math.round(c.g * 255)}_${Math.round(c.b * 255)}_${Math.round(c.a * 255)}`;
              buckets.set(key, (buckets.get(key) || 0) + area);
            }
          }
        }
      }
    } catch (e) {
    }

    try {
      if (node.children && (node.type === 'FRAME' || node.type === 'GROUP')) {
        for (const child of [...node.children]) {
          if (!child) continue;
          queue.push(child);
        }
      }
    } catch (e) {
    }
  }

  if (buckets.size === 0) return null;

  let bestKey = '';
  let bestWeight = -1;
  for (const [key, weight] of buckets.entries()) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestKey = key;
    }
  }

  const parts = bestKey.split('_').map(v => Number(v));
  if (parts.length !== 4 || parts.some(v => !isFinite(v))) return null;
  return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts[3] / 255 };
}

function findLargestMajorColorFrame(root, majorColor) {
  if (!majorColor) return '';
  const maxNodes = 8000;
  const queue = [root];
  const visited = new Set();
  let processed = 0;
  let bestId = '';
  let bestArea = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    processed++;
    if (processed > maxNodes) break;

    if (node.type === 'FRAME' && hasFillOrStroke(node)) {
      const solid = getFirstVisibleSolidFillColor(node);
      if (solid && isSameRGBA(solid, majorColor)) {
        const area = getNodeArea(node);
        if (area > bestArea) {
          bestArea = area;
          bestId = node.id;
        }
      }
    }

    try {
      if (node.children && (node.type === 'FRAME' || node.type === 'GROUP')) {
        for (const child of [...node.children]) {
          if (!child) continue;
          queue.push(child);
        }
      }
    } catch (e) {
    }
  }

  return bestId;
}

/**
 * 检查 Frame 是否有描边
 */
function hasStroke(node) {
  const strokes = node.strokes;
  if (strokes && Array.isArray(strokes) && strokes.length > 0) {
    // 检查是否有可见的描边
    for (const stroke of strokes) {
      if (stroke.visible !== false) {
        if (stroke.type === 'SOLID' || stroke.type === 'GRADIENT_LINEAR' ||
          stroke.type === 'GRADIENT_RADIAL' || stroke.type === 'GRADIENT_ANGULAR' ||
          stroke.type === 'GRADIENT_DIAMOND') {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 检查 Frame 是否有 fill 或 stroke
 */
function hasFillOrStroke(node) {
  return hasFillColor(node) || hasStroke(node);
}

/**
 * 检查节点是否可以被展平
 * - 不是 Instance
 * - 不是包含图片的 Frame
 * 不是有填充颜色的 Frame（这类 Frame 去除 auto layout 后应保留）
 */
function canFlatten(node) {
  // 跳过 Instance
  if (node.type === 'INSTANCE') {
    return false;
  }
  // 跳过包含图片的 Frame
  if (node.type === 'FRAME' && containsImage(node)) {
    return false;
  }
  // 跳过有填充颜色的 Frame（去除 auto layout 后应保留 frame）
  if (node.type === 'FRAME' && hasFillColor(node)) {
    return false;
  }
  return true;
}

/**
 * 收集所有可展平的子元素
 * 返回元素及其全局位置
 */
function collectFlattenableElements(node, result = []) {
  const children = [...node.children];

  for (const child of children) {
    if (!isNodeValid(child)) continue;

    // 如果包含图片，完全跳过该 Frame 及其所有子元素
    if (child.type === 'FRAME' && containsImage(child)) {
      result.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
      continue;
    }

    // 如果是 Group 或 Frame，递归收集
    if ((child.type === 'GROUP' || child.type === 'FRAME') && canFlatten(child)) {
      collectFlattenableElements(child, result);
    } else {
      // 其他元素（包括 Instance、有填充颜色的 Frame）直接收集
      result.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
    }
  }

  return result;
}

/**
 * 去除 Frame 的 Auto Layout
 * 保存尺寸并去除 auto layout
 */
function removeAutoLayout(node) {
  if (node.type === 'FRAME' && node.layoutMode !== 'NONE') {
    // 保存当前尺寸
    const originalWidth = node.width;
    const originalHeight = node.height;
    
    // 去除 Auto Layout
    node.layoutMode = 'NONE';
    
    // 恢复原始尺寸（去除 Auto Layout 后尺寸可能会变）
    node.resize(originalWidth, originalHeight);
    
    return true;
  }
  return false;
}

/**
 * 第一步：遍历所有节点，去除所有 Auto Layout（包含自身）
 * 按照从主容器到子容器的顺序执行，以保证元素不发生位移
 * 注意：此阶段不判断特例，所有 frame 的 auto layout 都会被去除
 */
function removeAllAutoLayout(node) {
  // 先处理自身（主容器优先）
  removeAutoLayout(node);

  // 再递归处理子容器
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child)) continue;
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      removeAllAutoLayout(child);
    }
  }
}

/**
 * 展平结构（仅展平，不处理 auto layout）
 * 将所有 Group/Frame 去除（不删除元素）
 * 不对以下组件执行 flatten：Instance、包含图片的 Frame、有 fill 的 Frame
 * 所有元素保持相对于原始父节点的绝对位置不变
 */
function flattenStructureOnly(node, majorColor = null, keepMajorFrameId = '') {
  // 获取原始父节点的全局位置（作为参考点）
  const parentGlobalPos = getAbsolutePosition(node);

  // 收集所有需要保留的元素及其全局位置
  const elementsToKeep = [];
  const children = [...node.children];

  for (const child of children) {
    if (!isNodeValid(child)) continue;

    // 不对 Instance 执行 flatten
    if (child.type === 'INSTANCE') {
      elementsToKeep.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
      continue;
    }

    // 不对包含图片的 Frame 执行 flatten
    if (child.type === 'FRAME' && containsDirectImage(child)) {
      elementsToKeep.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
      continue;
    }

    if (child.type === 'FRAME' && hasFillOrStroke(child)) {
      const childSolid = getFirstVisibleSolidFillColor(child);
      const shouldUnskip = childSolid && majorColor && isSameRGBA(childSolid, majorColor) && child.id !== keepMajorFrameId;
      if (!shouldUnskip) {
        elementsToKeep.push({
          node: child,
          globalX: getAbsolutePosition(child).x,
          globalY: getAbsolutePosition(child).y
        });
        continue;
      }
    }

    // 对其他 Group/Frame 执行 flatten（递归收集所有非容器子元素）
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      collectAllLeafElements(child, elementsToKeep, majorColor, keepMajorFrameId);
    } else {
      // 其他类型元素直接收集
      elementsToKeep.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
    }
  }

  // 将所有元素移动到父节点，并保持全局位置
  for (const item of elementsToKeep) {
    const element = item.node;
    if (!isNodeValid(element)) continue;
    try {
      // 将元素移动到父节点
      node.appendChild(element);
      // 计算相对于父节点的新位置
      element.x = item.globalX - parentGlobalPos.x;
      element.y = item.globalY - parentGlobalPos.y;
    } catch (e) {
      console.error('Error moving element:', e);
    }
  }

  // 删除所有已展平的 Group/Frame（Instance、包含图片的 Frame、有 fill 或 stroke 的 Frame 不会被删除）
  const childrenToRemove = [...node.children].filter(child =>
    isNodeValid(child) &&
    (child.type === 'GROUP' || child.type === 'FRAME') &&
    child.type !== 'INSTANCE' &&
    !(child.type === 'FRAME' && containsDirectImage(child)) &&
    !(child.type === 'FRAME' && hasFillOrStroke(child) && (() => {
      const childSolid = getFirstVisibleSolidFillColor(child);
      const shouldUnskip = childSolid && majorColor && isSameRGBA(childSolid, majorColor) && child.id !== keepMajorFrameId;
      return !shouldUnskip;
    })())
  );

  for (const child of childrenToRemove) {
    try {
      child.remove();
    } catch (e) {
      console.error('Error removing container:', e);
    }
  }

  // 递归处理剩余的子容器（从子容器到主容器顺序）
  const remainingChildren = [...node.children];
  for (const child of remainingChildren) {
    if (!isNodeValid(child)) continue;
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      flattenStructureOnly(child, majorColor, keepMajorFrameId);
    }
  }
}

/**
 * 递归收集所有非容器子元素（叶子元素）
 * 跳过 Instance、包含图片的 Frame、有 fill 的 Frame 及其子元素
 */
function collectAllLeafElements(node, result, majorColor = null, keepMajorFrameId = '') {
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child)) continue;

    // 跳过 Instance
    if (child.type === 'INSTANCE') {
      result.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
      continue;
    }

    // 跳过包含图片的 Frame
    if (child.type === 'FRAME' && containsDirectImage(child)) {
      result.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
      continue;
    }

    if (child.type === 'FRAME' && hasFillOrStroke(child)) {
      const childSolid = getFirstVisibleSolidFillColor(child);
      const shouldUnskip = childSolid && majorColor && isSameRGBA(childSolid, majorColor) && child.id !== keepMajorFrameId;
      if (!shouldUnskip) {
        result.push({
          node: child,
          globalX: getAbsolutePosition(child).x,
          globalY: getAbsolutePosition(child).y
        });
        continue;
      }
    }

    // 如果是 Group 或 Frame，继续递归
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      collectAllLeafElements(child, result, majorColor, keepMajorFrameId);
    } else {
      // 其他类型元素直接收集
      result.push({
        node: child,
        globalX: getAbsolutePosition(child).x,
        globalY: getAbsolutePosition(child).y
      });
    }
  }
}

// ==================== Auto Layout ====================

/**
 * 获取元素的矩形边界信息
 * 返回元素的 left, right, top, bottom 坐标
 */
function getElementBounds(el) {
  return {
    left: el.x,
    right: el.x + el.width,
    top: el.y,
    bottom: el.y + el.height,
    width: el.width,
    height: el.height,
    centerX: el.x + el.width / 2,
    centerY: el.y + el.height / 2
  };
}

/**
 * 检测两个元素是否在同一行
 * 规则：当两个元素的顶边与底边的y坐标值的区间有重合时，视为在同一行
 */
function isSameRow(el1, el2) {
  const bounds1 = getElementBounds(el1);
  const bounds2 = getElementBounds(el2);
  
  // Y轴区间有重合：max(top) < min(bottom)
  const overlapTop = Math.max(bounds1.top, bounds2.top);
  const overlapBottom = Math.min(bounds1.bottom, bounds2.bottom);
  
  return overlapTop < overlapBottom;
}

/**
 * 检测两个元素是否在同一列
 * 规则：当两个元素的左边与右边的x坐标值的区间有重合时，视为在同一列
 */
function isSameColumn(el1, el2) {
  const bounds1 = getElementBounds(el1);
  const bounds2 = getElementBounds(el2);
  
  // X轴区间有重合：max(left) < min(right)
  const overlapLeft = Math.max(bounds1.left, bounds2.left);
  const overlapRight = Math.min(bounds1.right, bounds2.right);
  
  return overlapLeft < overlapRight;
}

/**
 * 计算两个元素在X轴上的间距
 * 如果元素有重叠，返回负值（重叠宽度）
 */
function getHorizontalSpacing(el1, el2) {
  const bounds1 = getElementBounds(el1);
  const bounds2 = getElementBounds(el2);
  
  if (bounds1.right <= bounds2.left) {
    // el1 在 el2 左边
    return bounds2.left - bounds1.right;
  } else if (bounds2.right <= bounds1.left) {
    // el2 在 el1 左边
    return bounds1.left - bounds2.right;
  } else {
    // 有重叠
    const overlap = Math.min(bounds1.right, bounds2.right) - Math.max(bounds1.left, bounds2.left);
    return -overlap;
  }
}

/**
 * 计算两个元素在Y轴上的间距
 * 如果元素有重叠，返回负值（重叠高度）
 */
function getVerticalSpacing(el1, el2) {
  const bounds1 = getElementBounds(el1);
  const bounds2 = getElementBounds(el2);
  
  if (bounds1.bottom <= bounds2.top) {
    // el1 在 el2 上方
    return bounds2.top - bounds1.bottom;
  } else if (bounds2.bottom <= bounds1.top) {
    // el2 在 el1 上方
    return bounds1.top - bounds2.bottom;
  } else {
    // 有重叠
    const overlap = Math.min(bounds1.bottom, bounds2.bottom) - Math.max(bounds1.top, bounds2.top);
    return -overlap;
  }
}

/**
 * 给所有 Frame/Group 应用 Auto Layout
 * 采用新规则：
 * 1. 从最小层级容器开始处理，逐步处理到选中的容器
 * 2. 先处理同一行，后处理同一列
 * 3. 在同一行/列中，遍历间距最近的元素对添加 auto layout，直到没有孤立元素
 * maxLevelNode: 最大层级节点，处理不会超出此节点
 */
function applyAutoLayoutToAll(node, maxLevelNode = null, depth = 0) {
  // 先递归处理子容器（从最小层级开始）
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child)) continue;
    if (child.type === 'FRAME' || child.type === 'GROUP') {
      applyAutoLayoutToAll(child, maxLevelNode || node, depth + 1);
    }
  }

  // 然后处理当前节点（但不超过最大层级节点）
  if ((node.type === 'FRAME' || node.type === 'GROUP') && node.layoutMode === 'NONE') {
    const validChildren = [...node.children].filter(isNodeValid);
    if (validChildren.length >= 2) {
      applyAutoLayoutWithNewRules(node);
    }
  }
}

/**
 * 使用新规则应用 Auto Layout
 * 处理优先级：
 * 1. 从最小层级的容器中的所有元素开始处理，逐步处理到选中的容器
 * 2. 先检测后添加，且每次添加后重新检测
 * 3. 先处理同一行，后处理同一列
 * 4. 当在同一行中同时存在同一列时，则在该行内优先处理同一列的元素
 */
function applyAutoLayoutWithNewRules(node) {
  let children = [...node.children].filter(isNodeValid);
  if (children.length < 2) return;
  let hasChanges = true;

  // 循环检测和添加，直到没有变化
  while (hasChanges && children.length >= 2) {
    hasChanges = false;

    // 检测所有行组
    const rowGroups = detectRowGroups(children);

    // 规则3 & 4：先处理行，但在行内优先处理列
    if (rowGroups.length > 0) {
      const processed = processRowGroupsWithColumnPriority(node, rowGroups);
      if (processed) {
        hasChanges = true;
        children = [...node.children].filter(isNodeValid);
        continue;
      }
    }

    // 第二步：处理跨行的列（全局列）
    const colGroups = detectColumnGroups(children);
    if (colGroups.length > 0) {
      const processed = processColumnGroupsWithMulti(node, colGroups);
      if (processed) {
        hasChanges = true;
        children = [...node.children].filter(isNodeValid);
        continue;
      }
    }
  }
}

/**
 * 检测所有行分组
 * 返回每个行组包含的元素数组
 */
function detectRowGroups(elements) {
  const groups = [];
  const processed = new Set();
  
  // 按Y坐标排序
  const sortedByY = [...elements].sort((a, b) => {
    return getElementBounds(a).centerY - getElementBounds(b).centerY;
  });
  
  for (let i = 0; i < sortedByY.length; i++) {
    if (processed.has(sortedByY[i])) continue;
    
    const rowElements = [sortedByY[i]];
    processed.add(sortedByY[i]);
    
    for (let j = i + 1; j < sortedByY.length; j++) {
      if (processed.has(sortedByY[j])) continue;
      
      const isInRow = rowElements.some(el => isSameRow(el, sortedByY[j]));
      if (isInRow) {
        rowElements.push(sortedByY[j]);
        processed.add(sortedByY[j]);
      }
    }
    
    if (rowElements.length >= 2) {
      groups.push(rowElements);
    }
  }
  
  return groups;
}

/**
 * 检测所有列分组
 * 返回每个列组包含的元素数组
 */
function detectColumnGroups(elements) {
  const groups = [];
  const processed = new Set();
  
  // 按X坐标排序
  const sortedByX = [...elements].sort((a, b) => {
    return getElementBounds(a).centerX - getElementBounds(b).centerX;
  });
  
  for (let i = 0; i < sortedByX.length; i++) {
    if (processed.has(sortedByX[i])) continue;
    
    const colElements = [sortedByX[i]];
    processed.add(sortedByX[i]);
    
    for (let j = i + 1; j < sortedByX.length; j++) {
      if (processed.has(sortedByX[j])) continue;
      
      const isInCol = colElements.some(el => isSameColumn(el, sortedByX[j]));
      if (isInCol) {
        colElements.push(sortedByX[j]);
        processed.add(sortedByX[j]);
      }
    }
    
    if (colElements.length >= 2) {
      groups.push(colElements);
    }
  }
  
  return groups;
}

/**
 * 处理行组 - 在行内优先处理列关系（规则4）
 * 返回是否处理了任何组
 */
function processRowGroupsWithColumnPriority(node, rowGroups) {
  for (let i = 0; i < rowGroups.length; i++) {
    const rowGroup = rowGroups[i];
    if (rowGroup.length < 2) continue;

    // 规则4：在行内检测列关系
    const innerColGroups = detectColumnGroups(rowGroup);

    if (innerColGroups.length > 0) {
      // 先在行内处理列
      for (let j = 0; j < innerColGroups.length; j++) {
        const colGroup = innerColGroups[j];
        if (colGroup.length < 2) continue;

        const processed = applyProgressiveLayoutWithMulti(node, colGroup, false);
        if (processed) {
          return true;
        }
      }
    }

    // 行内没有列关系，或者列处理完毕，处理行关系
    const processed = applyProgressiveLayoutWithMulti(node, rowGroup, true);
    if (processed) {
      return true;
    }
  }

  return false;
}

/**
 * 处理列组 - 支持多个元素同时最近的情况
 * 返回是否处理了任何组
 */
function processColumnGroupsWithMulti(node, colGroups) {
  let processedAny = false;
  
  for (let i = 0; i < colGroups.length; i++) {
    const group = colGroups[i];
    if (group.length < 2) continue;
    
    // 使用新的多元素处理逻辑
    const processed = applyProgressiveLayoutWithMulti(node, group, false);
    if (processed) {
      processedAny = true;
      // 只处理一个组，然后返回重新检测
      return processedAny;
    }
  }
  
  return processedAny;
}

/**
 * 应用渐进式布局 - 支持多个元素间距同时最近的情况
 * 新规则：
 * 1. 找出间距最近的元素对
 * 2. 如果多个元素对的间距相同且最小，同时处理这些元素对
 * 3. 例：abc间距同时最近，则给abc添加，然后给abc和d添加
 * isHorizontal: true为横向，false为纵向
 * 返回是否创建了任何frame
 */
function applyProgressiveLayoutWithMulti(parentNode, elements, isHorizontal) {
  if (elements.length < 2) return false;
  const spacingFunc = isHorizontal ? getHorizontalSpacing : getVerticalSpacing;

  // 按坐标排序
  let remainingElements = [...elements].sort((a, b) => {
    return isHorizontal ? a.x - b.x : a.y - b.y;
  });

  // 找出最小间距
  let minSpacing = Infinity;
  for (let i = 0; i < remainingElements.length; i++) {
    for (let j = i + 1; j < remainingElements.length; j++) {
      const spacing = spacingFunc(remainingElements[i], remainingElements[j]);
      if (spacing >= 0 && spacing < minSpacing) {
        minSpacing = spacing;
      }
    }
  }

  if (minSpacing === Infinity) {
    return false;
  }

  // 构建连接图：找出所有间距等于最小间距的连接
  const connections = [];
  for (let i = 0; i < remainingElements.length; i++) {
    for (let j = i + 1; j < remainingElements.length; j++) {
      const spacing = spacingFunc(remainingElements[i], remainingElements[j]);
      if (spacing === minSpacing) {
        connections.push([remainingElements[i], remainingElements[j]]);
      }
    }
  }

  if (connections.length === 0) {
    return false;
  }

  // 使用并查集找出所有连通分量
  const groups = findConnectedGroups(remainingElements, connections);

  // 过滤出包含多个元素的组
  const multiElementGroups = groups.filter(g => g.length >= 2);

  if (multiElementGroups.length === 0) {
    return false;
  }

  // 处理每个多元素组
  let createdAny = false;
  for (let i = 0; i < multiElementGroups.length; i++) {
    const group = multiElementGroups[i];

    const frame = createAutoLayoutFrame(parentNode, group, isHorizontal);
    if (frame) {
      createdAny = true;
    }
  }

  return createdAny;
}

/**
 * 使用并查集找出连通分量
 * 返回每个连通分量包含的元素数组
 */
function findConnectedGroups(elements, connections) {
  // 初始化并查集
  const parent = new Map();
  elements.forEach(el => parent.set(el, el));

  function find(el) {
    if (parent.get(el) !== el) {
      parent.set(el, find(parent.get(el)));
    }
    return parent.get(el);
  }

  function union(el1, el2) {
    const root1 = find(el1);
    const root2 = find(el2);
    if (root1 !== root2) {
      parent.set(root1, root2);
    }
  }

  // 合并所有连接
  for (const [el1, el2] of connections) {
    union(el1, el2);
  }

  // 收集连通分量
  const groups = new Map();
  for (const el of elements) {
    const root = find(el);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(el);
  }

  return Array.from(groups.values());
}

/**
 * 创建 Auto Layout Frame
 * 将一组元素包裹在带有 auto layout 的 frame 中
 */
function createAutoLayoutFrame(parentNode, elements, isHorizontal) {
  if (elements.length < 2) return null;
  
  // 保存元素的原始绝对位置
  const elementPositions = elements.map(el => ({
    element: el,
    absX: getAbsolutePosition(el).x,
    absY: getAbsolutePosition(el).y
  }));
  
  // 计算边界框
  const minX = Math.min(...elementPositions.map(e => e.absX));
  const minY = Math.min(...elementPositions.map(e => e.absY));
  const maxX = Math.max(...elementPositions.map(e => e.absX + e.element.width));
  const maxY = Math.max(...elementPositions.map(e => e.absY + e.element.height));
  
  // 创建新的 Frame
  const newFrame = figma.createFrame();
  newFrame.name = isHorizontal ? 'Row' : 'Column';
  
  // 设置 Frame 位置和大小
  const parentAbsPos = getAbsolutePosition(parentNode);
  newFrame.x = minX - parentAbsPos.x;
  newFrame.y = minY - parentAbsPos.y;
  newFrame.resize(maxX - minX, maxY - minY);
  
  // 移除默认 fill
  newFrame.fills = [];
  
  // 按轴向排序元素
  elementPositions.sort((a, b) => {
    return isHorizontal ? a.absX - b.absX : a.absY - b.absY;
  });
  
  // 将元素移动到新的 Frame
  for (const item of elementPositions) {
    try {
      newFrame.appendChild(item.element);
      item.element.x = item.absX - minX;
      item.element.y = item.absY - minY;
    } catch (e) {
    }
  }
  
  const prefer = isHorizontal ? 'HORIZONTAL' : 'VERTICAL';
  const best = chooseBestAutoLayoutConfig(newFrame, [...newFrame.children].filter(isNodeValid), prefer);
  if (best) {
    for (const child of best.children) {
      try {
        newFrame.appendChild(child);
      } catch (e) {
      }
    }

    newFrame.layoutMode = best.layoutMode;
    newFrame.primaryAxisAlignItems = best.primaryAlign;
    newFrame.counterAxisAlignItems = best.counterAlign;
    newFrame.itemSpacing = Math.max(0, Math.round(best.itemSpacing));

    if (best.layoutMode === 'HORIZONTAL') {
      newFrame.paddingLeft = Math.round(best.paddingStart);
      newFrame.paddingRight = 0;
      newFrame.paddingTop = Math.round(best.paddingCrossStart);
      newFrame.paddingBottom = Math.round(best.paddingCrossEnd);
    } else {
      newFrame.paddingTop = Math.round(best.paddingStart);
      newFrame.paddingBottom = 0;
      newFrame.paddingLeft = Math.round(best.paddingCrossStart);
      newFrame.paddingRight = Math.round(best.paddingCrossEnd);
    }

    const pm = best.primarySizingMode || 'AUTO';
    const cm = best.counterSizingMode || 'AUTO';
    applySizingModes(newFrame, best.layoutMode, pm, cm, maxX - minX, maxY - minY);
  } else {
    newFrame.layoutMode = prefer;
    newFrame.primaryAxisAlignItems = 'MIN';
    newFrame.counterAxisAlignItems = 'MIN';
    newFrame.itemSpacing = 0;
    newFrame.paddingLeft = 0;
    newFrame.paddingTop = 0;
    newFrame.paddingRight = 0;
    newFrame.paddingBottom = 0;
    freezeFrameSize(newFrame, maxX - minX, maxY - minY);
  }
  
  // 添加到父节点
  try {
    parentNode.appendChild(newFrame);
  } catch (e) {
  }
  
  return newFrame;
}

function rangesOverlap(startA, endA, startB, endB, minOverlap = 0.01) {
  const overlap = Math.min(endA, endB) - Math.max(startA, startB);
  return overlap > minOverlap;
}

function isRelationFrame(node) {
  return node && node.type === 'FRAME' && (node.name === 'Row Relation' || node.name === 'Column Relation');
}

function getRelationType(node) {
  if (!node || node.type !== 'FRAME') return null;
  try {
    const t = node.getPluginData('autofix:relation');
    if (t === 'row' || t === 'col') return t;
  } catch (e) {
  }
  if (node.name === 'Row Relation') return 'row';
  if (node.name === 'Column Relation') return 'col';
  return null;
}

function getAbsoluteBounds(node) {
  const pos = getAbsolutePosition(node);
  return {
    left: pos.x,
    top: pos.y,
    right: pos.x + node.width,
    bottom: pos.y + node.height
  };
}

function groupByOverlapConnectivity(elements, axis) {
  const isY = axis === 'y';
  const items = elements.map(el => {
    const b = getAbsoluteBounds(el);
    return {
      el,
      start: isY ? b.top : b.left,
      end: isY ? b.bottom : b.right
    };
  });

  items.sort((a, b) => a.start - b.start);

  const connections = [];
  let active = [];
  for (const item of items) {
    active = active.filter(a => a.end >= item.start);
    for (const a of active) {
      if (rangesOverlap(a.start, a.end, item.start, item.end)) {
        connections.push([a.el, item.el]);
      }
    }
    active.push(item);
  }

  if (connections.length === 0) {
    return elements.map(el => [el]);
  }

  return findConnectedGroups(elements, connections);
}

function createRelationFrame(parentNode, elements, relationType, runId, addStroke = true) {
  if (elements.length < 2) return null;

  const parentChildren = parentNode.children ? [...parentNode.children] : [];
  const indices = elements
    .map(el => parentChildren.indexOf(el))
    .filter(i => i >= 0);
  const minIndex = indices.length > 0 ? Math.min(...indices) : parentChildren.length;

  const elementPositions = elements.map(el => ({
    element: el,
    absX: getAbsolutePosition(el).x,
    absY: getAbsolutePosition(el).y
  }));

  const minX = Math.min(...elementPositions.map(e => e.absX));
  const minY = Math.min(...elementPositions.map(e => e.absY));
  const maxX = Math.max(...elementPositions.map(e => e.absX + e.element.width));
  const maxY = Math.max(...elementPositions.map(e => e.absY + e.element.height));

  const isRow = relationType === 'row';
  const newFrame = figma.createFrame();
  newFrame.name = isRow ? 'Row Relation' : 'Column Relation';

  const parentAbsPos = getAbsolutePosition(parentNode);
  newFrame.x = minX - parentAbsPos.x;
  newFrame.y = minY - parentAbsPos.y;
  newFrame.resize(maxX - minX, maxY - minY);

  newFrame.fills = [];
  newFrame.strokes = [];
  if (addStroke) {
    newFrame.strokeWeight = 1;
    newFrame.strokeAlign = 'INSIDE';
    newFrame.strokes = [
      {
        type: 'SOLID',
        color: isRow ? { r: 1, g: 0, b: 0 } : { r: 0, g: 0, b: 1 }
      }
    ];
  }
  newFrame.clipsContent = false;

  try {
    newFrame.setPluginData('autofix:relation', isRow ? 'row' : 'col');
  } catch (e) {
  }

  if (runId) {
    try {
      newFrame.setPluginData('autofix:groupRun', runId);
    } catch (e) {
    }
  }

  elementPositions.sort((a, b) => {
    return isRow ? a.absX - b.absX : a.absY - b.absY;
  });

  try {
    const insertIndex = Math.min(Math.max(minIndex, 0), parentNode.children.length);
    if (typeof parentNode.insertChild === 'function') {
      parentNode.insertChild(insertIndex, newFrame);
    } else {
      parentNode.appendChild(newFrame);
    }
  } catch (e) {
    try {
      parentNode.appendChild(newFrame);
    } catch (e2) {
      console.error('Error adding relation frame to parent:', e2);
      return null;
    }
  }

  let failed = false;
  const moved = [];
  for (const item of elementPositions) {
    try {
      newFrame.appendChild(item.element);
      moved.push(item);
      item.element.x = item.absX - minX;
      item.element.y = item.absY - minY;
    } catch (e) {
      failed = true;
      console.error('Error moving element to relation frame:', e);
      break;
    }
  }

  if (failed) {
    for (const item of moved) {
      try {
        parentNode.appendChild(item.element);
        item.element.x = item.absX - parentAbsPos.x;
        item.element.y = item.absY - parentAbsPos.y;
      } catch (e) {
      }
    }
    try {
      if (newFrame.parent) newFrame.remove();
    } catch (e) {
    }
    return null;
  }

  return newFrame;
}

function createWrapFrame(parentNode, elements, name, axis, runId, addStroke = true) {
  if (elements.length < 2) return null;

  const parentChildren = parentNode.children ? [...parentNode.children] : [];
  const indices = elements
    .map(el => parentChildren.indexOf(el))
    .filter(i => i >= 0);
  const minIndex = indices.length > 0 ? Math.min(...indices) : parentChildren.length;

  const elementPositions = elements.map(el => ({
    element: el,
    absX: getAbsolutePosition(el).x,
    absY: getAbsolutePosition(el).y
  }));

  const minX = Math.min(...elementPositions.map(e => e.absX));
  const minY = Math.min(...elementPositions.map(e => e.absY));
  const maxX = Math.max(...elementPositions.map(e => e.absX + e.element.width));
  const maxY = Math.max(...elementPositions.map(e => e.absY + e.element.height));

  const newFrame = figma.createFrame();
  newFrame.name = name || 'Nearest Group';

  const parentAbsPos = parentNode.type === 'PAGE' ? { x: 0, y: 0 } : getAbsolutePosition(parentNode);
  newFrame.x = minX - parentAbsPos.x;
  newFrame.y = minY - parentAbsPos.y;
  newFrame.resize(maxX - minX, maxY - minY);

  newFrame.fills = [];
  newFrame.strokes = [];
  if (addStroke) {
    newFrame.strokeWeight = 1;
    newFrame.strokeAlign = 'INSIDE';
    newFrame.strokes = [
      {
        type: 'SOLID',
        color: { r: 0, g: 1, b: 0 }
      }
    ];
  }
  newFrame.clipsContent = false;

  if (axis) {
    try {
      newFrame.setPluginData('autofix:wrapAxis', axis);
    } catch (e) {
    }
  }

  if (runId) {
    try {
      newFrame.setPluginData('autofix:groupRun', runId);
    } catch (e) {
    }
  }

  try {
    const insertIndex = Math.min(Math.max(minIndex, 0), parentNode.children.length);
    if (typeof parentNode.insertChild === 'function') {
      parentNode.insertChild(insertIndex, newFrame);
    } else {
      parentNode.appendChild(newFrame);
    }
  } catch (e) {
    try {
      parentNode.appendChild(newFrame);
    } catch (e2) {
      try {
        newFrame.remove();
      } catch (e3) {
      }
      return null;
    }
  }

  let failed = false;
  const moved = [];
  for (const item of elementPositions) {
    try {
      newFrame.appendChild(item.element);
      moved.push(item);
      item.element.x = item.absX - minX;
      item.element.y = item.absY - minY;
    } catch (e) {
      failed = true;
      break;
    }
  }

  if (failed) {
    for (const item of moved) {
      try {
        parentNode.appendChild(item.element);
        item.element.x = item.absX - parentAbsPos.x;
        item.element.y = item.absY - parentAbsPos.y;
      } catch (e) {
      }
    }
    try {
      if (newFrame.parent) newFrame.remove();
    } catch (e) {
    }
    return null;
  }

  return newFrame;
}

function getDetectableChildren(container) {
  const rawChildren = container.children ? [...container.children] : [];
  return rawChildren.filter(child => {
    if (!isNodeValid(child)) return false;
    if (child.locked) return false;
    return typeof child.width === 'number' && typeof child.height === 'number' && child.width > 0 && child.height > 0;
  });
}

function groupElementsInContainer(container, runId, addStroke = true) {
  const elements = getDetectableChildren(container);
  const containerRelationType = getRelationType(container);

  if (containerRelationType === 'row') {
    return 0;
  }

  const rowGroups = groupByOverlapConnectivity(elements, 'y').filter(g => g.length >= 2);
  if (rowGroups.length === 0) return 0;

  if (isRelationFrame(container) && rowGroups.length === 1 && rowGroups[0].length === elements.length) {
    return 0;
  }

  let created = 0;
  for (const g of rowGroups) {
    const frame = createRelationFrame(container, g, 'row', runId, addStroke);
    if (frame) created++;
  }
  return created;
}

function groupAllRelationsInContainer(container, runId, addStroke = true) {
  let createdTotal = 0;

  let guard = 0;
  while (true) {
    guard++;
    if (guard > 500) break;

    const createdRows = groupElementsInContainer(container, runId, addStroke);
    if (createdRows > 0) {
      createdTotal += createdRows;
      continue;
    }

    const elements = getDetectableChildren(container);
    const containerRelationType = getRelationType(container);

    if (containerRelationType === 'col') {
      break;
    }

    const colGroups = groupByOverlapConnectivity(elements, 'x').filter(g => g.length >= 2);
    if (colGroups.length === 0) {
      break;
    }

    if (isRelationFrame(container) && colGroups.length === 1 && colGroups[0].length === elements.length) {
      break;
    }

    let createdCols = 0;
    for (const g of colGroups) {
      const frame = createRelationFrame(container, g, 'col', runId, addStroke);
      if (frame) createdCols++;
    }

    if (createdCols === 0) {
      break;
    }

    createdTotal += createdCols;
  }

  return createdTotal;
}

function groupAllRelationsInSubtree(rootContainer, runId, addStroke = true) {
  const visited = new Set();
  const queue = [rootContainer];
  let createdTotal = 0;

  while (queue.length > 0) {
    const container = queue.shift();
    if (!container || !isNodeValid(container)) continue;
    if (container.type !== 'FRAME' && container.type !== 'GROUP') continue;
    if (visited.has(container.id)) continue;
    visited.add(container.id);

    createdTotal += groupAllRelationsInContainer(container, runId, addStroke);

    const children = container.children ? [...container.children] : [];
    for (const child of children) {
      if (!isNodeValid(child)) continue;
      if (child.type === 'FRAME' || child.type === 'GROUP') {
        queue.push(child);
      }
    }
  }

  return createdTotal;
}

function getGroupRunId(node) {
  if (!node || typeof node.getPluginData !== 'function') return '';
  try {
    return node.getPluginData('autofix:groupRun') || '';
  } catch (e) {
    return '';
  }
}

function wrapClosestUntilOne(container, addStroke = true) {
  const relationType = getRelationType(container);
  if (!relationType) return 0;
  const isHorizontal = relationType === 'row';
  const spacingFunc = isHorizontal ? getHorizontalSpacing : getVerticalSpacing;

  const initial = getDetectableChildren(container).length;
  if (initial < 3) return 0;

  let createdTotal = 0;
  let guard = 0;
  while (true) {
    guard++;
    if (guard > 500) break;

    const children = getDetectableChildren(container);
    if (children.length <= 2) break;

    let minSpacing = Infinity;
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const spacing = spacingFunc(children[i], children[j]);
        if (spacing >= 0 && spacing < minSpacing) {
          minSpacing = spacing;
        }
      }
    }

    if (minSpacing === Infinity) break;

    const connections = [];
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const spacing = spacingFunc(children[i], children[j]);
        if (Math.abs(spacing - minSpacing) < 0.01) {
          connections.push([children[i], children[j]]);
        }
      }
    }

    if (connections.length === 0) break;

    const groups = findConnectedGroups(children, connections).filter(g => g.length >= 2);
    if (groups.length === 0) break;

    let createdThisRound = 0;
    const runId = getGroupRunId(container);
    for (const g of groups) {
      const frame = createWrapFrame(container, g, 'Nearest Group', relationType, runId, addStroke);
      if (frame) createdThisRound++;
    }

    if (createdThisRound === 0) break;
    createdTotal += createdThisRound;
  }

  return createdTotal;
}

function wrapClosestInNewRelationFrames(rootContainer, runId, addStroke = true) {
  const targets = [];
  const queue = [{ node: rootContainer, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    const node = item.node;
    const depth = item.depth;
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'FRAME' && getRelationType(node) && getGroupRunId(node) === runId) {
      targets.push({ node, depth });
    }

    if (node.children) {
      for (const child of [...node.children]) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }
  }

  targets.sort((a, b) => b.depth - a.depth);

  let createdTotal = 0;
  for (const t of targets) {
    createdTotal += wrapClosestUntilOne(t.node, addStroke);
  }
  return createdTotal;
}

// ==================== Smart Rename ====================

/**
 * 递归重命名
 */
function smartRename(node) {
  const children = [...node.children];
  for (const child of children) {
    if (!isNodeValid(child))
      continue;
    // 跳过 Instance，不重命名
    if (child.type === 'INSTANCE') {
      continue;
    }
    renameNode(child);
    // 递归处理子容器
    if (child.type === 'GROUP' || child.type === 'FRAME') {
      smartRename(child);
    }
  }
}

/**
 * 重命名单个节点
 */
function renameNode(node) {
  const newName = generateSmartName(node);
  if (newName && newName !== node.name) {
    node.name = newName;
  }
}

/**
 * 根据节点类型生成智能名称
 */
function generateSmartName(node) {
  switch (node.type) {
    case 'FRAME':
      return generateFrameName(node);
    case 'GROUP':
      return generateGroupName(node);
    case 'RECTANGLE':
      return generateRectangleName(node);
    case 'ELLIPSE':
      return generateEllipseName(node);
    case 'TEXT':
      return generateTextName(node);
    case 'VECTOR':
      return generateVectorName(node);
    case 'COMPONENT':
      return generateComponentName(node);
    case 'INSTANCE':
      return generateInstanceName(node);
    case 'LINE':
      return 'Divider';
    case 'STAR':
      return 'Star';
    case 'POLYGON':
      return 'Polygon';
    case 'BOOLEAN_OPERATION':
      return 'Shape';
    default:
      return node.type.toLowerCase().replace(/_/g, '-');
  }
}

/**
 * 生成 Frame 名称
 */
function generateFrameName(node) {
  if (node.layoutMode !== 'NONE') {
    return node.layoutMode === 'HORIZONTAL' ? 'Row' : 'Column';
  }
  const children = node.children;
  if (children.length === 0)
    return 'Container';
  const hasImages = children.some(c => c.type === 'RECTANGLE' && c.fills);
  const hasText = children.some(c => c.type === 'TEXT');
  const hasButtons = children.some(c => c.type === 'COMPONENT' || c.type === 'INSTANCE');
  if (hasButtons && hasText)
    return 'Card';
  if (hasImages)
    return 'Image-Container';
  if (hasText && children.length <= 3)
    return 'Text-Block';
  return 'Container';
}

/**
 * 生成 Group 名称
 */
function generateGroupName(node) {
  const children = node.children;
  if (children.length === 0)
    return 'Group';
  const types = new Set(children.map(c => c.type));
  if (types.has('TEXT') && types.has('RECTANGLE'))
    return 'Label';
  if (types.size === 1) {
    const type = Array.from(types)[0];
    if (type === 'RECTANGLE')
      return 'Shapes';
    if (type === 'ELLIPSE')
      return 'Circles';
    if (type === 'TEXT')
      return 'Texts';
  }
  return 'Group';
}

/**
 * 生成 Rectangle 名称
 */
function generateRectangleName(node) {
  const fills = node.fills;
  if (fills && Array.isArray(fills) && fills.length > 0) {
    const fill = fills[0];
    if (fill.type === 'IMAGE')
      return 'Image';
    if (fill.type === 'SOLID') {
      if (node.width > 200 && node.height > 200)
        return 'Background';
    }
  }
  const ratio = node.width / node.height;
  if (ratio > 5)
    return 'Divider-H';
  if (ratio < 0.2)
    return 'Divider-V';
  return 'Rectangle';
}

/**
 * 生成 Ellipse 名称
 */
function generateEllipseName(node) {
  if (Math.abs(node.width - node.height) < 2) {
    if (node.width <= 64 && node.height <= 64)
      return 'Avatar';
    return 'Circle';
  }
  return 'Ellipse';
}

/**
 * 生成 Text 名称
 */
function generateTextName(node) {
  const text = node.characters.trim();
  if (!text)
    return 'Text';
  if (text.length <= 3 && /^[\u4e00-\u9fa5]{2}$/.test(text))
    return 'Label-CN';
  if (text.length <= 5)
    return 'Label';
  if (text.length > 50)
    return 'Paragraph';
  const fontSize = node.fontSize;
  if (typeof fontSize === 'number') {
    if (fontSize >= 24)
      return 'Heading';
    if (fontSize >= 16)
      return 'Title';
    if (fontSize <= 12)
      return 'Caption';
  }
  return 'Text';
}

/**
 * 生成 Vector 名称
 */
function generateVectorName(node) {
  const name = node.name.toLowerCase();
  if (name.includes('arrow') || name.includes('chevron'))
    return 'Arrow';
  if (name.includes('check') || name.includes('tick'))
    return 'Check';
  if (name.includes('close') || name.includes('x') || name.includes('×'))
    return 'Close';
  if (name.includes('plus') || name.includes('+'))
    return 'Plus';
  if (name.includes('minus') || name.includes('-'))
    return 'Minus';
  if (name.includes('search') || name.includes('magnify'))
    return 'Search';
  if (name.includes('menu') || name.includes('hamburger'))
    return 'Menu';
  if (name.includes('home'))
    return 'Home';
  if (name.includes('user') || name.includes('person'))
    return 'User';
  if (name.includes('settings') || name.includes('gear'))
    return 'Settings';
  if (name.includes('heart') || name.includes('like'))
    return 'Heart';
  if (name.includes('star'))
    return 'Star-Icon';
  if (name.includes('bell') || name.includes('notification'))
    return 'Notification';
  return 'Icon';
}

/**
 * 生成 Component 名称
 */
function generateComponentName(node) {
  const children = node.children;
  if (children.length === 0)
    return 'Component';
  const hasText = children.some(c => c.type === 'TEXT');
  const hasRect = children.some(c => c.type === 'RECTANGLE');
  if (hasText && hasRect) {
    const textNode = children.find(c => c.type === 'TEXT');
    if (textNode) {
      const text = textNode.characters.toLowerCase();
      if (text.includes('submit') || text.includes('save') || text.includes('confirm'))
        return 'Button-Primary';
      if (text.includes('cancel') || text.includes('delete'))
        return 'Button-Danger';
      if (text.includes('edit') || text.includes('modify'))
        return 'Button-Secondary';
    }
    return 'Button';
  }
  if (hasText)
    return 'Text-Component';
  if (hasRect)
    return 'Shape-Component';
  return 'Component';
}

/**
 * 生成 Instance 名称
 */
function generateInstanceName(node) {
  const mainComponent = node.mainComponent;
  if (mainComponent) {
    return mainComponent.name;
  }
  return 'Instance';
}

// ==================== Main Entry ====================

// 显示插件 UI - 使用 hug 模式，根据内容自动调整高度
figma.showUI(__html__, { width: 430, height: 600 });

function postSelectionState() {
  const selection = figma.currentPage && figma.currentPage.selection ? figma.currentPage.selection : [];
  figma.ui.postMessage({ type: 'selection-state', hasSelection: selection.length > 0 });
}

postSelectionState();
figma.on('selectionchange', () => {
  postSelectionState();
});

// 处理 UI 消息
figma.ui.onmessage = (msg) => {
  const lang = msg && typeof msg.lang === 'string' ? normalizeLang(msg.lang) : 'en';
  if (msg && msg.type === 'set-language') {
    return;
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify(tr('selectFirst', lang));
    return;
  }

  // Check if running in quiet mode (for user mode combo execution)
  const isQuiet = msg && msg.quiet === true;

  switch (msg.type) {
    case 'remove-hidden':
      handleRemoveHidden(selection, lang, isQuiet);
      break;
    case 'remove-outside-container':
      handleRemoveOutsideContainer(selection, lang, isQuiet);
      break;
    case 'remove-overlap-images':
      handleRemoveOverlapImages(selection, lang, isQuiet);
      break;
    case 'smart-rename':
      handleSmartRename(selection, lang, isQuiet);
      break;
    case 'flatten-ra':
      handleFlattenRemoveAutoLayout(selection, lang, isQuiet);
      break;
    case 'flatten-cg':
      handleFlattenConvertGroups(selection, lang, isQuiet);
      break;
    case 'flatten-as':
      handleFlattenApplyDominantShape(selection, lang, isQuiet);
      break;
    case 'flatten-mc':
      handleFlattenDetectMajorColor(selection, lang, isQuiet);
      break;
    case 'flatten-op':
      handleFlattenRemoveAutoLayout(selection, lang, isQuiet);
      handleFlattenConvertGroups(figma.currentPage.selection, lang, isQuiet);
      break;
    case 'flatten-ft':
      handleFlattenFT(selection, lang, isQuiet);
      break;
    case 'group-elements':
      handleGroupElements(selection, msg.addStroke !== false, lang, isQuiet);
      break;
    case 'group-elements-al':
      handleGroupElementsAutoLayout(selection, lang, isQuiet);
      break;
    case 'ge-rel':
      handleGroupElementsCreateRelations(selection, msg.addStroke !== false, msg.runId, lang, isQuiet);
      break;
    case 'ge-wrap':
      handleGroupElementsWrap(selection, msg.addStroke !== false, msg.runId, lang, isQuiet);
      break;
    case 'ge-al-convert':
      handleGroupElementsConvertToAutoLayout(selection, lang, isQuiet);
      break;
    case 'ge-al-cg':
      handleGroupElementsConvertGroups(selection, lang, isQuiet);
      break;
    case 'ge-al-apply-clean':
      handleGroupElementsApplyAndCleanup(selection, lang, isQuiet);
      break;
    case 'ge-al-container':
      handleGroupElementsConvertContainers(selection, lang, isQuiet);
      break;
    case 'combo-step1-done':
      figma.notify(tr('step1Done', lang));
      break;
    case 'combo-step2-done':
      figma.notify(tr('step2Done', lang));
      break;
    case 'module-remove-invisible-done':
      figma.notify(tr('moduleRemoveInvisibleDone', lang));
      break;
    case 'module-smart-rename-done':
      figma.notify(tr('moduleSmartRenameDone', lang));
      break;
    case 'module-flatten-structure-done':
      figma.notify(tr('moduleFlattenStructureDone', lang));
      break;
    case 'module-group-elements-done':
      figma.notify(tr('moduleGroupElementsDone', lang));
      break;
  }
};

function hasVisiblePaints(paints) {
  if (!paints) return false;
  if (paints === figma.mixed) return true;
  if (!Array.isArray(paints)) return false;
  return paints.some(p => p && p.visible !== false);
}

function hasFillOrStroke(frame) {
  if (!frame || frame.type !== 'FRAME') return false;
  try {
    if (hasVisiblePaints(frame.fills)) return true;
  } catch (e) {
  }
  try {
    if (hasVisiblePaints(frame.strokes)) return true;
  } catch (e) {
  }
  return false;
}

function freezeFrameSize(frame, width, height) {
  if (!frame || frame.type !== 'FRAME') return;
  try {
    if (frame.layoutMode !== 'NONE') {
      frame.primaryAxisSizingMode = 'FIXED';
      frame.counterAxisSizingMode = 'FIXED';
    }
  } catch (e) {
  }
  try {
    if (typeof frame.resizeWithoutConstraints === 'function') {
      frame.resizeWithoutConstraints(width, height);
    } else {
      frame.resize(width, height);
    }
  } catch (e) {
  }
}

function applySizingModes(frame, layoutMode, primarySizingMode, counterSizingMode, fixedWidth, fixedHeight) {
  if (!frame || frame.type !== 'FRAME') return;
  try {
    frame.primaryAxisSizingMode = primarySizingMode;
  } catch (e) {
  }
  try {
    frame.counterAxisSizingMode = counterSizingMode;
  } catch (e) {
  }

  if (primarySizingMode !== 'FIXED' && counterSizingMode !== 'FIXED') return;

  let targetW = frame.width;
  let targetH = frame.height;
  if (layoutMode === 'HORIZONTAL') {
    if (primarySizingMode === 'FIXED') targetW = fixedWidth;
    if (counterSizingMode === 'FIXED') targetH = fixedHeight;
  } else {
    if (primarySizingMode === 'FIXED') targetH = fixedHeight;
    if (counterSizingMode === 'FIXED') targetW = fixedWidth;
  }

  try {
    if (typeof frame.resizeWithoutConstraints === 'function') {
      frame.resizeWithoutConstraints(targetW, targetH);
    } else {
      frame.resize(targetW, targetH);
    }
  } catch (e) {
  }
}

function trySetHugContentIfNoExtraSpace(frame, paddingStart, paddingCrossStart, paddingCrossEnd, itemSpacing, layoutMode) {
  if (!frame || frame.type !== 'FRAME') return false;
  if (frame.layoutMode === 'NONE') return false;
  try {
    const children = frame.children ? [...frame.children].filter(isNodeValid) : [];
    if (children.length === 0) return false;
    const isHorizontal = layoutMode === 'HORIZONTAL';
    const sizesPrimary = children.map(ch => (isHorizontal ? ch.width : ch.height));
    const sizesCross = children.map(ch => (isHorizontal ? ch.height : ch.width));
    const framePrimarySize = isHorizontal ? frame.width : frame.height;
    const frameCrossSize = isHorizontal ? frame.height : frame.width;

    const totalSizes = sizesPrimary.reduce((a, b) => a + b, 0);
    const totalUsedPrimary = paddingStart + totalSizes + itemSpacing * Math.max(0, children.length - 1);
    const maxCross = sizesCross.reduce((a, b) => Math.max(a, b), 0);
    const totalUsedCross = paddingCrossStart + maxCross + paddingCrossEnd;

    const extraPrimary = framePrimarySize - totalUsedPrimary;
    const extraCross = frameCrossSize - totalUsedCross;
    const tol = 0.5;
    if (extraPrimary > tol || extraCross > tol) return false;

    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    return true;
  } catch (e) {
    return false;
  }
}

function pickAlignForSingleChild(primaryExtra, childPrimaryPos, tolerance) {
  const candidates = [
    { align: 'MIN', shift: 0 },
    { align: 'CENTER', shift: primaryExtra / 2 },
    { align: 'MAX', shift: primaryExtra }
  ];
  let best = null;
  for (const c of candidates) {
    const d = c.shift - childPrimaryPos;
    const dist2 = d * d;
    if (!best || dist2 < best.dist2) best = { align: c.align, dist2 };
  }
  if (!best) return null;
  if (best.dist2 <= tolerance * tolerance) return best.align;
  return null;
}

function convertFrameToAutoLayoutMinMove(frame, preferLayoutMode) {
  if (!frame || frame.type !== 'FRAME') return false;
  if (frame.layoutMode !== 'NONE') return false;
  if (frame.locked) return false;
  if (hasInstanceAncestor(frame)) return false;

  const originalWidth = frame.width;
  const originalHeight = frame.height;

  const children = frame.children ? [...frame.children].filter(isNodeValid) : [];
  const fallbackMode = preferLayoutMode || 'HORIZONTAL';

  if (children.length === 0) {
    frame.layoutMode = fallbackMode;
    frame.primaryAxisAlignItems = 'MIN';
    frame.counterAxisAlignItems = 'MIN';
    frame.itemSpacing = 0;
    frame.paddingLeft = 0;
    frame.paddingTop = 0;
    frame.paddingRight = 0;
    frame.paddingBottom = 0;
    freezeFrameSize(frame, originalWidth, originalHeight);
    return true;
  }

  if (children.length === 1) {
    const child = children[0];
    const cx = typeof child.x === 'number' ? child.x : 0;
    const cy = typeof child.y === 'number' ? child.y : 0;
    const tolerance = 0.5;
    frame.layoutMode = fallbackMode;

    const framePrimarySize = frame.layoutMode === 'HORIZONTAL' ? frame.width : frame.height;
    const frameCrossSize = frame.layoutMode === 'HORIZONTAL' ? frame.height : frame.width;
    const childPrimarySize = frame.layoutMode === 'HORIZONTAL' ? child.width : child.height;
    const childCrossSize = frame.layoutMode === 'HORIZONTAL' ? child.height : child.width;
    const primaryExtra = Math.max(0, framePrimarySize - childPrimarySize);
    const crossExtra = Math.max(0, frameCrossSize - childCrossSize);

    const primaryAlign = pickAlignForSingleChild(primaryExtra, frame.layoutMode === 'HORIZONTAL' ? cx : cy, tolerance);
    const counterAlign = pickAlignForSingleChild(crossExtra, frame.layoutMode === 'HORIZONTAL' ? cy : cx, tolerance);

    frame.itemSpacing = 0;
    if (primaryAlign && counterAlign) {
      frame.primaryAxisAlignItems = primaryAlign;
      frame.counterAxisAlignItems = counterAlign;
      frame.paddingLeft = 0;
      frame.paddingRight = 0;
      frame.paddingTop = 0;
      frame.paddingBottom = 0;
    } else {
      frame.primaryAxisAlignItems = 'MIN';
      frame.counterAxisAlignItems = 'MIN';
      if (frame.layoutMode === 'HORIZONTAL') {
        frame.paddingLeft = Math.max(0, Math.round(cx));
        frame.paddingRight = 0;
        frame.paddingTop = Math.max(0, Math.round(cy));
        frame.paddingBottom = 0;
      } else {
        frame.paddingTop = Math.max(0, Math.round(cy));
        frame.paddingBottom = 0;
        frame.paddingLeft = Math.max(0, Math.round(cx));
        frame.paddingRight = 0;
      }
    }
    freezeFrameSize(frame, originalWidth, originalHeight);
    return true;
  }

  const best = chooseBestAutoLayoutConfig(frame, children, preferLayoutMode);
  if (!best) return false;

  for (const child of best.children) {
    try {
      frame.appendChild(child);
    } catch (e) {
    }
  }

  frame.layoutMode = best.layoutMode;
  frame.primaryAxisAlignItems = best.primaryAlign;
  frame.counterAxisAlignItems = best.counterAlign;
  frame.itemSpacing = Math.max(0, Math.round(best.itemSpacing));

  if (best.layoutMode === 'HORIZONTAL') {
    frame.paddingLeft = Math.round(best.paddingStart);
    frame.paddingRight = 0;
    frame.paddingTop = Math.round(best.paddingCrossStart);
    frame.paddingBottom = Math.round(best.paddingCrossEnd);
  } else {
    frame.paddingTop = Math.round(best.paddingStart);
    frame.paddingBottom = 0;
    frame.paddingLeft = Math.round(best.paddingCrossStart);
    frame.paddingRight = Math.round(best.paddingCrossEnd);
  }

  freezeFrameSize(frame, originalWidth, originalHeight);

  return true;
}

function hasInstanceAncestor(node) {
  let current = node;
  while (current && current.parent) {
    if (current.parent.type === 'INSTANCE') return true;
    current = current.parent;
  }
  return false;
}

function getFromGroupFlag(node) {
  if (!node || node.type !== 'FRAME') return '';
  try {
    return node.getPluginData('autofix:fromGroup') || '';
  } catch (e) {
    return '';
  }
}

function isAutoFixManagedFrame(node) {
  if (!node || node.type !== 'FRAME') return false;
  return !!getRelationType(node) || !!getWrapAxis(node) || getFromGroupFlag(node) === '1';
}

function ungroupFrameKeepAbsolute(frame) {
  if (!frame || frame.type !== 'FRAME') return false;
  if (!frame.parent) return false;
  if (frame.locked) return false;
  if (hasInstanceAncestor(frame)) return false;

  const parent = frame.parent;
  if (!parent || !('children' in parent)) return false;

  const parentChildren = parent.children ? [...parent.children] : [];
  const insertIndex = parentChildren.indexOf(frame);

  const frameAbs = getAbsolutePosition(frame);
  const parentAbs = parent.type === 'PAGE' ? { x: 0, y: 0 } : getAbsolutePosition(parent);

  const children = frame.children ? [...frame.children] : [];
  const positions = children
    .filter(isNodeValid)
    .map(child => ({
      child,
      absX: getAbsolutePosition(child).x,
      absY: getAbsolutePosition(child).y
    }));

  let movedCount = 0;
  for (let i = 0; i < positions.length; i++) {
    const item = positions[i];
    try {
      if (typeof parent.insertChild === 'function' && insertIndex >= 0) {
        parent.insertChild(insertIndex + i, item.child);
      } else {
        parent.appendChild(item.child);
      }
      item.child.x = item.absX - parentAbs.x;
      item.child.y = item.absY - parentAbs.y;
      movedCount++;
    } catch (e) {
      break;
    }
  }

  if (movedCount !== positions.length) {
    for (const item of positions.slice(0, movedCount)) {
      try {
        frame.appendChild(item.child);
        item.child.x = item.absX - frameAbs.x;
        item.child.y = item.absY - frameAbs.y;
      } catch (e) {
      }
    }
    return false;
  }

  try {
    frame.remove();
  } catch (e) {
  }

  return true;
}

function clampNumber(n, min, max) {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function fitLineLeastSquares(points) {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0 };
  if (n === 1) return { a: points[0].y, b: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-6) {
    return { a: sumY / n, b: 0 };
  }

  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;
  return { a, b };
}

function computeAutoLayoutScore(frame, children, layoutMode, paddingStart, paddingCrossStart, paddingCrossEnd, itemSpacing, primaryAlign, counterAlign) {
  const isHorizontal = layoutMode === 'HORIZONTAL';
  const framePrimarySize = isHorizontal ? frame.width : frame.height;
  const frameCrossSize = isHorizontal ? frame.height : frame.width;
  return computeAutoLayoutScoreWithSizes(framePrimarySize, frameCrossSize, children, layoutMode, paddingStart, paddingCrossStart, paddingCrossEnd, itemSpacing, primaryAlign, counterAlign);
}

function computeAutoLayoutScoreWithSizes(framePrimarySize, frameCrossSize, children, layoutMode, paddingStart, paddingCrossStart, paddingCrossEnd, itemSpacing, primaryAlign, counterAlign) {
  const isHorizontal = layoutMode === 'HORIZONTAL';

  const sizesPrimary = children.map(ch => (isHorizontal ? ch.width : ch.height));
  const sizesCross = children.map(ch => (isHorizontal ? ch.height : ch.width));
  const posPrimary = children.map(ch => (isHorizontal ? ch.x : ch.y));
  const posCross = children.map(ch => (isHorizontal ? ch.y : ch.x));

  const basePrimary = [paddingStart];
  for (let i = 1; i < children.length; i++) {
    basePrimary[i] = basePrimary[i - 1] + sizesPrimary[i - 1] + itemSpacing;
  }
  const contentPrimaryEnd = basePrimary[children.length - 1] + sizesPrimary[children.length - 1];
  const totalPrimaryUsed = contentPrimaryEnd;
  const extraPrimary = Math.max(0, framePrimarySize - totalPrimaryUsed);

  let primaryShift = 0;
  if (primaryAlign === 'CENTER') primaryShift = extraPrimary / 2;
  if (primaryAlign === 'MAX') primaryShift = extraPrimary;

  let score = 0;
  for (let i = 0; i < children.length; i++) {
    const predP = basePrimary[i] + primaryShift;
    let predC = 0;
    if (counterAlign === 'MIN') {
      predC = paddingCrossStart;
    } else if (counterAlign === 'CENTER') {
      const inner = frameCrossSize - paddingCrossStart - paddingCrossEnd;
      predC = paddingCrossStart + (inner - sizesCross[i]) / 2;
    } else {
      predC = frameCrossSize - paddingCrossEnd - sizesCross[i];
    }

    const dP = predP - posPrimary[i];
    const dC = predC - posCross[i];
    score += dP * dP + dC * dC;
  }

  return score;
}

function chooseBestAutoLayoutConfig(frame, children, preferLayoutMode) {
  const candidates = preferLayoutMode ? [preferLayoutMode, preferLayoutMode === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL'] : ['HORIZONTAL', 'VERTICAL'];
  let best = null;
  const scoreEps = 1e-6;

  for (const layoutMode of candidates) {
    const isHorizontal = layoutMode === 'HORIZONTAL';
    const sorted = [...children].sort((a, b) => (isHorizontal ? a.x - b.x : a.y - b.y));
    if (sorted.length <= 1) continue;
    const scoreSlack = Math.max(scoreEps, sorted.length * 0.25);

    const sizesPrimary = sorted.map(ch => (isHorizontal ? ch.width : ch.height));
    const posPrimary = sorted.map(ch => (isHorizontal ? ch.x : ch.y));

    const prefix = [0];
    for (let i = 1; i < sorted.length; i++) {
      prefix[i] = prefix[i - 1] + sizesPrimary[i - 1];
    }

    const points = [];
    for (let i = 0; i < sorted.length; i++) {
      points.push({ x: i, y: posPrimary[i] - prefix[i] });
    }

    const fit = fitLineLeastSquares(points);
    const paddingStartFit = clampNumber(fit.a, 0, 100000);
    const itemSpacingFit = clampNumber(fit.b, 0, 100000);

    const framePrimarySize = isHorizontal ? frame.width : frame.height;
    const totalSizes = sizesPrimary.reduce((a, b) => a + b, 0);

    const paddingStartCandidates = [paddingStartFit, 0];
    const uniquePaddingStartCandidates = [];
    for (const p of paddingStartCandidates) {
      if (!uniquePaddingStartCandidates.some(x => Math.abs(x - p) <= scoreEps)) uniquePaddingStartCandidates.push(p);
    }

    const posCross = sorted.map(ch => (isHorizontal ? ch.y : ch.x));
    const sizesCross = sorted.map(ch => (isHorizontal ? ch.height : ch.width));
    const frameCrossSize = isHorizontal ? frame.height : frame.width;

    const meanCross = posCross.reduce((a, b) => a + b, 0) / posCross.length;
    const meanCrossEnd = posCross
      .map((c, idx) => frameCrossSize - sizesCross[idx] - c)
      .reduce((a, b) => a + b, 0) / posCross.length;

    const paddingMin = clampNumber(meanCross, 0, 100000);
    const paddingMaxEnd = clampNumber(meanCrossEnd, 0, 100000);

    const counterCandidates = [
      { counter: 'MIN', padStart: 0, padEnd: 0 },
      { counter: 'MIN', padStart: paddingMin, padEnd: 0 },
      { counter: 'CENTER', padStart: 0, padEnd: 0 },
      { counter: 'MAX', padStart: 0, padEnd: 0 },
      { counter: 'MAX', padStart: 0, padEnd: paddingMaxEnd }
    ];
    const uniqueCounterCandidates = [];
    for (const cc of counterCandidates) {
      const key = cc.counter + ':' + Math.round(cc.padStart) + ':' + Math.round(cc.padEnd);
      if (!uniqueCounterCandidates.some(x => x.key === key)) {
        uniqueCounterCandidates.push({ counter: cc.counter, padStart: cc.padStart, padEnd: cc.padEnd, key });
      }
    }

    const primaryCandidates = ['MIN', 'CENTER', 'MAX'];
    const sizingCandidates = [
      { primary: 'AUTO', counter: 'AUTO', prefer: 2 },
      { primary: 'FIXED', counter: 'AUTO', prefer: 1 },
      { primary: 'AUTO', counter: 'FIXED', prefer: 1 },
      { primary: 'FIXED', counter: 'FIXED', prefer: 0 }
    ];

    for (const paddingStart of uniquePaddingStartCandidates) {
      let itemSpacing = itemSpacingFit;
      const totalUsed = paddingStart + totalSizes + itemSpacing * (sorted.length - 1);
      if (totalUsed > framePrimarySize && sorted.length > 1) {
        itemSpacing = clampNumber((framePrimarySize - paddingStart - totalSizes) / (sorted.length - 1), 0, 100000);
      }

      const primaryUsed = paddingStart + totalSizes + itemSpacing * Math.max(0, sorted.length - 1);

      for (const cc of uniqueCounterCandidates) {
        const maxCross = sizesCross.reduce((a, b) => Math.max(a, b), 0);
        const crossUsed = cc.padStart + maxCross + cc.padEnd;
        for (const pa of primaryCandidates) {
          for (const sc of sizingCandidates) {
            const candPrimarySize = sc.primary === 'AUTO' ? primaryUsed : framePrimarySize;
            const candCrossSize = sc.counter === 'AUTO' ? crossUsed : frameCrossSize;
            const score = computeAutoLayoutScoreWithSizes(candPrimarySize, candCrossSize, sorted, layoutMode, paddingStart, cc.padStart, cc.padEnd, itemSpacing, pa, cc.counter);
            const paddingPenalty = Math.abs(paddingStart) + Math.abs(cc.padStart) + Math.abs(cc.padEnd);

            const isBetter =
              !best ||
              score < best.score - scoreEps ||
              (score <= best.score + scoreSlack && paddingPenalty < best.paddingPenalty - scoreEps) ||
              (score <= best.score + scoreSlack && Math.abs(paddingPenalty - best.paddingPenalty) <= scoreEps && sc.prefer > best.hugPrefer);

            if (isBetter) {
              best = {
                layoutMode,
                children: sorted,
                paddingStart,
                paddingEnd: 0,
                paddingCrossStart: cc.padStart,
                paddingCrossEnd: cc.padEnd,
                itemSpacing,
                primaryAlign: pa,
                counterAlign: cc.counter,
                score,
                paddingPenalty,
                primarySizingMode: sc.primary,
                counterSizingMode: sc.counter,
                hugPrefer: sc.prefer
              };
            }
          }
        }
      }
    }
  }

  return best;
}

function convertRelationFrameToAutoLayout(frame) {
  const relationType = getRelationType(frame);
  if (!relationType) return false;
  if (frame.type !== 'FRAME') return false;
  if (frame.layoutMode !== 'NONE') return false;

  const originalWidth = frame.width;
  const originalHeight = frame.height;

  const prefer = relationType === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  const children = [...frame.children].filter(isNodeValid);
  if (children.length === 0) {
    frame.layoutMode = prefer;
    frame.primaryAxisAlignItems = 'MIN';
    frame.counterAxisAlignItems = 'MIN';
    frame.itemSpacing = 0;
    frame.paddingLeft = 0;
    frame.paddingTop = 0;
    frame.paddingRight = 0;
    frame.paddingBottom = 0;
    freezeFrameSize(frame, originalWidth, originalHeight);
    return true;
  }

  const best = chooseBestAutoLayoutConfig(frame, children, prefer);
  if (!best) return false;

  for (const child of best.children) {
    try {
      frame.appendChild(child);
    } catch (e) {
    }
  }

  frame.layoutMode = best.layoutMode;
  frame.primaryAxisAlignItems = best.primaryAlign;
  frame.counterAxisAlignItems = best.counterAlign;
  frame.itemSpacing = Math.max(0, Math.round(best.itemSpacing));

  if (best.layoutMode === 'HORIZONTAL') {
    frame.paddingLeft = Math.round(best.paddingStart);
    frame.paddingRight = 0;
    frame.paddingTop = Math.round(best.paddingCrossStart);
    frame.paddingBottom = Math.round(best.paddingCrossEnd);
  } else {
    frame.paddingTop = Math.round(best.paddingStart);
    frame.paddingBottom = 0;
    frame.paddingLeft = Math.round(best.paddingCrossStart);
    frame.paddingRight = Math.round(best.paddingCrossEnd);
  }

  const pm = best.primarySizingMode || 'AUTO';
  const cm = best.counterSizingMode || 'AUTO';
  applySizingModes(frame, best.layoutMode, pm, cm, originalWidth, originalHeight);

  return true;
}

function getWrapAxis(node) {
  if (!node || node.type !== 'FRAME') return null;
  try {
    const t = node.getPluginData('autofix:wrapAxis');
    if (t === 'row' || t === 'col') return t;
  } catch (e) {
  }
  return null;
}

function convertWrapFrameToAutoLayout(frame) {
  const axis = getWrapAxis(frame);
  if (!axis) return false;
  if (frame.type !== 'FRAME') return false;
  if (frame.layoutMode !== 'NONE') return false;

  const originalWidth = frame.width;
  const originalHeight = frame.height;

  const prefer = axis === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  const children = [...frame.children].filter(isNodeValid);
  if (children.length === 0) {
    frame.layoutMode = prefer;
    frame.primaryAxisAlignItems = 'MIN';
    frame.counterAxisAlignItems = 'MIN';
    frame.itemSpacing = 0;
    frame.paddingLeft = 0;
    frame.paddingTop = 0;
    frame.paddingRight = 0;
    frame.paddingBottom = 0;
    freezeFrameSize(frame, originalWidth, originalHeight);
    return true;
  }

  const best = chooseBestAutoLayoutConfig(frame, children, prefer);
  if (!best) return false;

  for (const child of best.children) {
    try {
      frame.appendChild(child);
    } catch (e) {
    }
  }

  frame.layoutMode = best.layoutMode;
  frame.primaryAxisAlignItems = best.primaryAlign;
  frame.counterAxisAlignItems = best.counterAlign;
  frame.itemSpacing = Math.max(0, Math.round(best.itemSpacing));

  if (best.layoutMode === 'HORIZONTAL') {
    frame.paddingLeft = Math.round(best.paddingStart);
    frame.paddingRight = 0;
    frame.paddingTop = Math.round(best.paddingCrossStart);
    frame.paddingBottom = Math.round(best.paddingCrossEnd);
  } else {
    frame.paddingTop = Math.round(best.paddingStart);
    frame.paddingBottom = 0;
    frame.paddingLeft = Math.round(best.paddingCrossStart);
    frame.paddingRight = Math.round(best.paddingCrossEnd);
  }

  const pm = best.primarySizingMode || 'AUTO';
  const cm = best.counterSizingMode || 'AUTO';
  applySizingModes(frame, best.layoutMode, pm, cm, originalWidth, originalHeight);

  return true;
}

function collectWrapFramesWithDepth(root) {
  const results = [];
  const queue = [{ node: root, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    const node = item.node;
    const depth = item.depth;
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'FRAME' && getWrapAxis(node)) {
      results.push({ frame: node, depth });
    }

    if (node.children) {
      const children = [...node.children];
      for (const child of children) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }
  }

  results.sort((a, b) => b.depth - a.depth);
  return results.map(r => r.frame);
}

function collectRelationFramesWithDepth(root) {
  const results = [];
  const queue = [{ node: root, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    const node = item.node;
    const depth = item.depth;
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'FRAME' && getRelationType(node)) {
      results.push({ frame: node, depth });
    }

    if (node.children) {
      const children = [...node.children];
      for (const child of children) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }
  }

  results.sort((a, b) => b.depth - a.depth);
  return results.map(r => r.frame);
}

function convertGroupsToFramesInSubtree(rootContainer) {
  const queue = [rootContainer];
  const visited = new Set();
  let converted = 0;

  function applyCornerRadii(source, frame) {
    if (!source || !frame) return;
    try {
      if ('cornerRadius' in source && 'cornerRadius' in frame && typeof source.cornerRadius === 'number') {
        frame.cornerRadius = source.cornerRadius;
      }
    } catch (e) {
    }
    try {
      if ('cornerSmoothing' in source && 'cornerSmoothing' in frame && typeof source.cornerSmoothing === 'number') {
        frame.cornerSmoothing = source.cornerSmoothing;
      }
    } catch (e) {
    }
    try {
      if ('topLeftRadius' in source && 'topLeftRadius' in frame) frame.topLeftRadius = source.topLeftRadius;
      if ('topRightRadius' in source && 'topRightRadius' in frame) frame.topRightRadius = source.topRightRadius;
      if ('bottomLeftRadius' in source && 'bottomLeftRadius' in frame) frame.bottomLeftRadius = source.bottomLeftRadius;
      if ('bottomRightRadius' in source && 'bottomRightRadius' in frame) frame.bottomRightRadius = source.bottomRightRadius;
    } catch (e) {
    }
  }

  function pickCornerSource(groupNode, groupAbs, children) {
    const eps = 1;
    try {
      for (const child of children) {
        if (!isNodeValid(child)) continue;
        if (!('isMask' in child) || child.isMask !== true) continue;
        const hasCorner = ('cornerRadius' in child) || ('topLeftRadius' in child) || ('topRightRadius' in child) || ('bottomLeftRadius' in child) || ('bottomRightRadius' in child);
        if (hasCorner) return child;
      }
    } catch (e) {
    }

    try {
      for (const child of children) {
        if (!isNodeValid(child)) continue;
        const hasCorner = ('cornerRadius' in child) || ('topLeftRadius' in child) || ('topRightRadius' in child) || ('bottomLeftRadius' in child) || ('bottomRightRadius' in child);
        if (!hasCorner) continue;
        const childAbs = getAbsolutePosition(child);
        const sizeMatch = Math.abs(child.width - groupNode.width) <= eps && Math.abs(child.height - groupNode.height) <= eps;
        const posMatch = Math.abs(childAbs.x - groupAbs.x) <= eps && Math.abs(childAbs.y - groupAbs.y) <= eps;
        if (sizeMatch && posMatch) return child;
      }
    } catch (e) {
    }

    return null;
  }

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || !isNodeValid(node)) continue;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'GROUP') {
      if (hasInstanceAncestor(node)) {
      } else if (node.parent && (node.parent.type === 'FRAME' || node.parent.type === 'GROUP' || node.parent.type === 'PAGE')) {
        const parent = node.parent;
        const parentChildren = parent.children ? [...parent.children] : [];
        const index = parentChildren.indexOf(node);

        const absPos = getAbsolutePosition(node);
        const children = node.children ? [...node.children].filter(isNodeValid) : [];
        const cornerSource = pickCornerSource(node, absPos, children);
        const childPositions = children.map(c => ({
          node: c,
          absX: getAbsolutePosition(c).x,
          absY: getAbsolutePosition(c).y
        }));

        const frame = figma.createFrame();
        frame.name = node.name;
        frame.fills = [];
        frame.clipsContent = true;
        try {
          frame.setPluginData('autofix:fromGroup', '1');
        } catch (e) {
        }

        const parentAbs = parent.type === 'PAGE' ? { x: 0, y: 0 } : getAbsolutePosition(parent);
        frame.x = absPos.x - parentAbs.x;
        frame.y = absPos.y - parentAbs.y;
        frame.resize(node.width, node.height);

        applyCornerRadii(cornerSource, frame);

        try {
          if (typeof parent.insertChild === 'function' && index >= 0) {
            parent.insertChild(index, frame);
          } else {
            parent.appendChild(frame);
          }
        } catch (e) {
          try {
            frame.remove();
          } catch (e2) {
          }
          continue;
        }

        const frameAbs = getAbsolutePosition(frame);
        let failed = false;
        for (const item of childPositions) {
          try {
            frame.appendChild(item.node);
            item.node.x = item.absX - frameAbs.x;
            item.node.y = item.absY - frameAbs.y;
          } catch (e) {
            failed = true;
            break;
          }
        }

        if (failed) {
          try {
            frame.remove();
          } catch (e) {
          }
          continue;
        }

        try {
          node.remove();
        } catch (e) {
        }

        converted++;
        queue.push(frame);
        continue;
      }
    }

    if (node.children) {
      const children = [...node.children];
      for (const child of children) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push(child);
        }
      }
    }
  }

  return converted;
}

function handleGroupElementsAutoLayout(selection, lang = 'en', quiet = false) {
  let convertedRelationFrames = 0;
  let convertedWrapFrames = 0;
  let convertedGroups = 0;
  let convertedContainers = 0;
  let ungroupedFrames = 0;

  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;

    const relationFrames = collectRelationFramesWithDepth(node);
    for (const frame of relationFrames) {
      if (hasInstanceAncestor(frame)) continue;
      if (convertRelationFrameToAutoLayout(frame)) {
        convertedRelationFrames++;
      }
    }

    const wrapFrames = collectWrapFramesWithDepth(node);
    for (const frame of wrapFrames) {
      if (hasInstanceAncestor(frame)) continue;
      if (convertWrapFrameToAutoLayout(frame)) {
        convertedWrapFrames++;
      }
    }

    convertedGroups += convertGroupsToFramesInSubtree(node);

    applyAutoLayoutToAll(node, node);

    convertedContainers += convertFilledStrokedContainersInSubtree(node);

    const managedFrames = [];
    const queue = [{ node, depth: 0 }];
    const visited = new Set();
    while (queue.length > 0) {
      const item = queue.shift();
      const current = item.node;
      const depth = item.depth;
      if (!current || !isNodeValid(current)) continue;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (current.type === 'FRAME' && isAutoFixManagedFrame(current) && current.layoutMode === 'NONE') {
        managedFrames.push({ frame: current, depth });
      }

      if (current.children) {
        for (const child of [...current.children]) {
          if (!isNodeValid(child)) continue;
          if (child.type === 'FRAME' || child.type === 'GROUP') {
            queue.push({ node: child, depth: depth + 1 });
          }
        }
      }
    }

    managedFrames.sort((a, b) => b.depth - a.depth);
    for (const item of managedFrames) {
      if (ungroupFrameKeepAbsolute(item.frame)) {
        ungroupedFrames++;
      }
    }
  }

  if (!quiet) figma.notify(tr('alDone', lang, { relation: convertedRelationFrames, wrap: convertedWrapFrames, containers: convertedContainers, groups: convertedGroups, ungrouped: ungroupedFrames }));
}

function handleGroupElements(selection, addStroke = true, lang = 'en', quiet = false) {
  const runId = String(Date.now());
  let createdTotal = 0;
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      createdTotal += groupAllRelationsInSubtree(node, runId, addStroke);
    }
  }

  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      wrapClosestInNewRelationFrames(node, runId, addStroke);
    }
  }

  if (!quiet) {
    if (createdTotal > 0) figma.notify(tr('groupedInto', lang, { count: createdTotal }));
    else figma.notify(tr('noRelations', lang));
  }
}

function handleGroupElementsCreateRelations(selection, addStroke = true, runId, lang = 'en', quiet = false) {
  const id = runId ? String(runId) : String(Date.now());
  let createdTotal = 0;
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      createdTotal += groupAllRelationsInSubtree(node, id, addStroke);
    }
  }

  if (!quiet) {
    if (createdTotal > 0) figma.notify(tr('createdRelations', lang, { count: createdTotal }));
    else figma.notify(tr('noRelations', lang));
  }
}

function wrapClosestInAllRelationFrames(rootContainer, runId, addStroke = true) {
  const relationFrames = collectRelationFramesWithDepth(rootContainer);
  let createdTotal = 0;
  for (const frame of relationFrames) {
    if (hasInstanceAncestor(frame)) continue;
    if (!getGroupRunId(frame)) {
      try {
        frame.setPluginData('autofix:groupRun', runId);
      } catch (e) {
      }
    }
    createdTotal += wrapClosestUntilOne(frame, addStroke);
  }
  return createdTotal;
}

function handleGroupElementsWrap(selection, addStroke = true, runId, lang = 'en', quiet = false) {
  const id = runId ? String(runId) : String(Date.now());
  let createdTotal = 0;
  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;
    if (runId) {
      createdTotal += wrapClosestInNewRelationFrames(node, id, addStroke);
    } else {
      createdTotal += wrapClosestInAllRelationFrames(node, id, addStroke);
    }
  }

  if (!quiet) {
    if (createdTotal > 0) figma.notify(tr('createdWrap', lang, { count: createdTotal }));
    else figma.notify(tr('noWrap', lang));
  }
}

function handleGroupElementsConvertToAutoLayout(selection, lang = 'en', quiet = false) {
  let convertedRelationFrames = 0;
  let convertedWrapFrames = 0;

  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;

    const relationFrames = collectRelationFramesWithDepth(node);
    for (const frame of relationFrames) {
      if (hasInstanceAncestor(frame)) continue;
      if (convertRelationFrameToAutoLayout(frame)) {
        convertedRelationFrames++;
      }
    }

    const wrapFrames = collectWrapFramesWithDepth(node);
    for (const frame of wrapFrames) {
      if (hasInstanceAncestor(frame)) continue;
      if (convertWrapFrameToAutoLayout(frame)) {
        convertedWrapFrames++;
      }
    }
  }

  if (!quiet) figma.notify(tr('convertedRelationsWrap', lang, { relation: convertedRelationFrames, wrap: convertedWrapFrames }));
}

function handleGroupElementsConvertGroups(selection, lang = 'en', quiet = false) {
  let convertedGroups = 0;
  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;
    convertedGroups += convertGroupsToFramesInSubtree(node);
  }
  if (!quiet) figma.notify(tr('convertedGroups', lang, { count: convertedGroups }));
}

function collectFillStrokeNoneFrames(root) {
  const frames = [];
  const queue = [{ node: root, depth: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    const current = item.node;
    const depth = item.depth;
    if (!current || !isNodeValid(current)) continue;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.type === 'FRAME' && current.layoutMode === 'NONE' && hasFillOrStroke(current)) {
      frames.push({ frame: current, depth });
    }

    if (current.children) {
      for (const child of [...current.children]) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }
  }
  frames.sort((a, b) => b.depth - a.depth);
  return frames.map(f => f.frame);
}

function convertFilledStrokedContainersInSubtree(root) {
  let converted = 0;
  const frames = collectFillStrokeNoneFrames(root);
  for (const frame of frames) {
    if (convertFrameToAutoLayoutMinMove(frame)) converted++;
  }
  return converted;
}

function handleGroupElementsConvertContainers(selection, lang = 'en', quiet = false) {
  let converted = 0;
  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;
    converted += convertFilledStrokedContainersInSubtree(node);
  }
  if (!quiet) figma.notify(tr('convertedContainers', lang, { count: converted }));
}

function collectManagedNoneFrames(root) {
  const managedFrames = [];
  const queue = [{ node: root, depth: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    const current = item.node;
    const depth = item.depth;
    if (!current || !isNodeValid(current)) continue;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.type === 'FRAME' && isAutoFixManagedFrame(current) && current.layoutMode === 'NONE') {
      managedFrames.push({ frame: current, depth });
    }

    if (current.children) {
      for (const child of [...current.children]) {
        if (!isNodeValid(child)) continue;
        if (child.type === 'FRAME' || child.type === 'GROUP') {
          queue.push({ node: child, depth: depth + 1 });
        }
      }
    }
  }

  managedFrames.sort((a, b) => b.depth - a.depth);
  return managedFrames.map(m => m.frame);
}

function handleGroupElementsApplyAndCleanup(selection, lang = 'en', quiet = false) {
  let ungroupedFrames = 0;

  for (const node of selection) {
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;
    applyAutoLayoutToAll(node, node);

    const managedNoneFrames = collectManagedNoneFrames(node);
    for (const frame of managedNoneFrames) {
      if (ungroupFrameKeepAbsolute(frame)) {
        ungroupedFrames++;
      }
    }
  }

  if (!quiet) figma.notify(tr('appliedCleaned', lang, { count: ungroupedFrames }));
}

/**
 * 处理删除隐藏元素
 */
function handleRemoveHidden(selection, lang = 'en', quiet = false) {
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      removeHiddenElements(node);
    }
  }
  if (!quiet) figma.notify(tr('hiddenRemoved', lang));
}

function handleRemoveOverlapImages(selection, lang = 'en', quiet = false) {
  let removed = 0;
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      removed += pruneOverlappedImagesInContainer(node);
    }
  }
  if (!quiet) figma.notify(tr('overlapImagesRemoved', lang, { count: removed }));
}

function handleRemoveOutsideContainer(selection, lang = 'en', quiet = false) {
  let removed = 0;
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      removed += pruneOutsideElementsInContainer(node);
    }
  }
  if (!quiet) figma.notify(tr('outsideElementsRemoved', lang, { count: removed }));
}

/**
 * 处理应用 Auto Layout
 * 给所有 Frame/Group 添加 auto layout，从子容器到父容器顺序执行
 * 保证所有元素的绝对位置不变
 * 最大层级为所选的 frame 或 group 自身
 */
/**
 * 处理智能重命名
 */
function handleSmartRename(selection, lang = 'en', quiet = false) {
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      // 先重命名选中的 Frame/Group 本身
      renameNode(node);
      // 然后递归重命名子元素
      smartRename(node);
    }
    else if (node.type !== 'INSTANCE') {
      // 对单个选中的非 Instance 元素进行重命名
      renameNode(node);
    }
  }
  if (!quiet) figma.notify(tr('renamed', lang));
}

function handleFlattenRemoveAutoLayout(selection, lang = 'en', quiet = false) {
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      removeAllAutoLayout(node);
    }
  }
  if (!quiet) figma.notify(tr('autoLayoutRemoved', lang));
}

function handleFlattenConvertGroups(selection, lang = 'en', quiet = false) {
  let convertedTotal = 0;
  const nextSelection = [];

  for (const node of selection) {
    if (node.type === 'GROUP') {
      const parent = node.parent;
      const index = parent && parent.children ? parent.children.indexOf(node) : -1;
      convertedTotal += convertGroupsToFramesInSubtree(node);
      const replacement = parent && index >= 0 && parent.children ? parent.children[index] : null;
      if (isNodeValid(node)) nextSelection.push(node);
      else if (replacement && isNodeValid(replacement)) nextSelection.push(replacement);
      continue;
    }

    if (node.type === 'FRAME') {
      convertedTotal += convertGroupsToFramesInSubtree(node);
      if (isNodeValid(node)) nextSelection.push(node);
    }
  }

  if (nextSelection.length > 0) {
    figma.currentPage.selection = nextSelection;
  }

  if (!quiet) figma.notify(tr('groupsConverted', lang, { count: convertedTotal }));
}

function handleFlattenApplyDominantShape(selection, lang = 'en', quiet = false) {
  let appliedCount = 0;
  let removedMaskCount = 0;

  function cloneValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  function getArea(node) {
    const w = typeof node.width === 'number' ? node.width : 0;
    const h = typeof node.height === 'number' ? node.height : 0;
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return 0;
    return w * h;
  }

  function isShape(node) {
    if (!node) return false;
    if (node.type === 'TEXT') return false;
    if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'INSTANCE') return false;
    return ('fills' in node) || ('strokes' in node);
  }

  function isImageShape(node) {
    if (!node) return false;
    try {
      if (!('fills' in node)) return false;
      const fills = node.fills;
      if (!fills || !Array.isArray(fills)) return false;
      for (const fill of fills) {
        if (fill && fill.visible !== false && fill.type === 'IMAGE') return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function isMaskShape(node) {
    if (!node) return false;
    try {
      if ('isMask' in node) return node.isMask === true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function copyShapeStyleToFrame(shape, frame) {
    const frameHadStrokes = (() => {
      try {
        if (!('strokes' in frame)) return false;
        return Array.isArray(frame.strokes) && frame.strokes.length > 0;
      } catch (e) {
        return false;
      }
    })();

    try {
      if ('fills' in shape && 'fills' in frame) {
        const existing = Array.isArray(frame.fills) ? frame.fills : [];
        const incoming = Array.isArray(shape.fills) ? shape.fills : [];
        const merged = [...cloneValue(existing), ...cloneValue(incoming)];
        frame.fills = merged;
      }
    } catch (e) {
    }

    let addedStrokes = false;
    try {
      if ('strokes' in shape && 'strokes' in frame) {
        const existing = Array.isArray(frame.strokes) ? frame.strokes : [];
        const incoming = Array.isArray(shape.strokes) ? shape.strokes : [];
        addedStrokes = incoming.length > 0;
        const merged = [...cloneValue(existing), ...cloneValue(incoming)];
        frame.strokes = merged;
      }
    } catch (e) {
    }

    if (addedStrokes && !frameHadStrokes) {
      try {
        if ('strokeWeight' in shape && 'strokeWeight' in frame) frame.strokeWeight = shape.strokeWeight;
      } catch (e) {
      }
      try {
        if ('strokeAlign' in shape && 'strokeAlign' in frame) frame.strokeAlign = shape.strokeAlign;
      } catch (e) {
      }
      try {
        if ('strokeCap' in shape && 'strokeCap' in frame) frame.strokeCap = shape.strokeCap;
      } catch (e) {
      }
      try {
        if ('strokeJoin' in shape && 'strokeJoin' in frame) frame.strokeJoin = shape.strokeJoin;
      } catch (e) {
      }
      try {
        if ('strokeMiterLimit' in shape && 'strokeMiterLimit' in frame) frame.strokeMiterLimit = shape.strokeMiterLimit;
      } catch (e) {
      }
      try {
        if ('dashPattern' in shape && 'dashPattern' in frame) frame.dashPattern = cloneValue(shape.dashPattern);
      } catch (e) {
      }
    }

    try {
      if ('effects' in shape && 'effects' in frame) {
        const existing = Array.isArray(frame.effects) ? frame.effects : [];
        const incoming = Array.isArray(shape.effects) ? shape.effects : [];
        const merged = [...cloneValue(existing), ...cloneValue(incoming)];
        frame.effects = merged;
      }
    } catch (e) {
    }

    try {
      const frameCornerRadius = 'cornerRadius' in frame && typeof frame.cornerRadius === 'number' ? frame.cornerRadius : 0;
      const shapeCornerRadius = 'cornerRadius' in shape && typeof shape.cornerRadius === 'number' ? shape.cornerRadius : 0;
      if ('cornerRadius' in frame && frameCornerRadius === 0 && shapeCornerRadius > 0) {
        frame.cornerRadius = shapeCornerRadius;
      }
    } catch (e) {
    }

    try {
      const frameCornerSmoothing = 'cornerSmoothing' in frame && typeof frame.cornerSmoothing === 'number' ? frame.cornerSmoothing : 0;
      const shapeCornerSmoothing = 'cornerSmoothing' in shape && typeof shape.cornerSmoothing === 'number' ? shape.cornerSmoothing : 0;
      if ('cornerSmoothing' in frame && frameCornerSmoothing === 0 && shapeCornerSmoothing > 0) {
        frame.cornerSmoothing = shapeCornerSmoothing;
      }
    } catch (e) {
    }

    try {
      const frameRadii = {
        tl: 'topLeftRadius' in frame ? frame.topLeftRadius : 0,
        tr: 'topRightRadius' in frame ? frame.topRightRadius : 0,
        bl: 'bottomLeftRadius' in frame ? frame.bottomLeftRadius : 0,
        br: 'bottomRightRadius' in frame ? frame.bottomRightRadius : 0,
      };
      const allZero = [frameRadii.tl, frameRadii.tr, frameRadii.bl, frameRadii.br].every(v => typeof v === 'number' && v === 0);
      if (allZero) {
        if ('topLeftRadius' in shape && 'topLeftRadius' in frame) frame.topLeftRadius = shape.topLeftRadius;
        if ('topRightRadius' in shape && 'topRightRadius' in frame) frame.topRightRadius = shape.topRightRadius;
        if ('bottomLeftRadius' in shape && 'bottomLeftRadius' in frame) frame.bottomLeftRadius = shape.bottomLeftRadius;
        if ('bottomRightRadius' in shape && 'bottomRightRadius' in frame) frame.bottomRightRadius = shape.bottomRightRadius;
      }
    } catch (e) {
    }
  }

  function processContainer(container, selectedFrame, selectedFrameArea) {
    if (!container || !isNodeValid(container)) return;

    const containerArea = getArea(container);
    if (containerArea <= 0) return;

    const children = container.children ? [...container.children] : [];
    const candidates = [];

    for (const child of children) {
      if (!isNodeValid(child)) continue;
      if (!isShape(child)) continue;
      if (isImageShape(child)) continue;
      const area = getArea(child);
      const ratio = area / containerArea;
      const ratioToSelected = selectedFrameArea > 0 ? (area / selectedFrameArea) : 0;
      if (ratio > 0.9) candidates.push({ node: child, ratio, ratioToSelected, area });
    }

    const removedIds = new Set();
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const byRatio = (b.ratio - a.ratio);
        if (byRatio !== 0) return byRatio;
        const byArea = (b.area - a.area);
        if (byArea !== 0) return byArea;
        const aId = a && a.node ? String(a.node.id || '') : '';
        const bId = b && b.node ? String(b.node.id || '') : '';
        return aId.localeCompare(bId);
      });
      for (const item of candidates) {
        const shape = item && item.node;
        if (!shape || !isNodeValid(shape)) continue;
        if (removedIds.has(shape.id)) continue;

        const targetFrame = (selectedFrame && selectedFrame.type === 'FRAME' && item.ratioToSelected > 0.9)
          ? selectedFrame
          : (container.type === 'FRAME' ? container : null);

        if (!targetFrame) continue;

        if (isMaskShape(shape)) {
          try {
            removedIds.add(shape.id);
            shape.remove();
            removedMaskCount++;
          } catch (e) {
          }
          continue;
        }

        copyShapeStyleToFrame(shape, targetFrame);
        try {
          removedIds.add(shape.id);
          shape.remove();
        } catch (e) {
        }
        appliedCount++;
      }
    }

    for (const child of children) {
      if (child && removedIds.has(child.id)) continue;
      if (!isNodeValid(child)) continue;
      if (child.type === 'FRAME' || child.type === 'GROUP') {
        processContainer(child, selectedFrame, selectedFrameArea);
      }
    }
  }

  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      const selectedFrame = node && node.type === 'FRAME' ? node : null;
      const selectedFrameArea = selectedFrame ? getArea(selectedFrame) : 0;
      processContainer(node, selectedFrame, selectedFrameArea);
    }
  }

  if (!quiet) figma.notify(tr('shapeStyleApplied', lang, { applied: appliedCount, removed: removedMaskCount }));
}

function handleFlattenDetectMajorColor(selection, lang = 'en', quiet = false) {
  const node = selection && selection.length > 0 ? selection[0] : null;
  if (!node || (node.type !== 'FRAME' && node.type !== 'GROUP')) {
    try {
      figma.ui.postMessage({ type: 'flatten-major-color', color: null });
    } catch (e) {
    }
    figma.notify(tr('noValidContainer', lang));
    return;
  }
  const majorColor = detectMajorColor(node);
  try {
    figma.ui.postMessage({ type: 'flatten-major-color', color: majorColor });
  } catch (e) {
  }
  if (!majorColor) {
    figma.notify(tr('majorColorNA', lang));
    return;
  }
  const r = Math.round(majorColor.r * 255);
  const g = Math.round(majorColor.g * 255);
  const b = Math.round(majorColor.b * 255);
  const a = typeof majorColor.a === 'number' ? majorColor.a : 1;
  if (!quiet) figma.notify(tr('majorColorValue', lang, { r, g, b, a: a.toFixed(2) }));
}

function handleFlattenFT(selection, lang = 'en', quiet = false) {
  for (const node of selection) {
    if (node.type === 'FRAME' || node.type === 'GROUP') {
      const majorColor = detectMajorColor(node);
      const keepMajorFrameId = findLargestMajorColorFrame(node, majorColor);
      flattenStructureOnly(node, majorColor, keepMajorFrameId);
    }
  }

  if (!quiet) figma.notify(tr('structureFlattened', lang));
}
