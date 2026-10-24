import { isObject } from './client.js';

export interface AreaPath {
  largeClassCode?: string;
  largeClassName?: string;
  middleClassCode?: string;
  middleClassName?: string;
  smallClassCode?: string;
  smallClassName?: string;
  detailClassCode?: string;
  detailClassName?: string;
  leaf: boolean;
}

const levels = ['large', 'middle', 'small', 'detail'] as const;

// Version 1 wraps each level in another object; version 2 uses arrays directly.
export function flattenAreas(value: unknown): AreaPath[] {
  const result: AreaPath[] = [];
  const walk = (node: unknown, path: AreaPath): void => {
    if (Array.isArray(node)) {
      const merged = Object.assign({}, ...node.filter(isObject));
      const codeObjects = node.filter(child => isObject(child) && levels.some(level => `${level}ClassCode` in child));
      if (codeObjects.length === 1) visit(merged, path);
      else node.forEach(child => walk(child, path));
    } else if (isObject(node)) visit(node, path);
  };
  const visit = (node: Record<string, unknown>, path: AreaPath): void => {
    const current: AreaPath = { ...path };
    let found = false;
    for (const level of levels) {
      const codeKey = `${level}ClassCode` as keyof AreaPath;
      const nameKey = `${level}ClassName` as keyof AreaPath;
      if (node[codeKey] !== undefined) {
        Object.assign(current, { [codeKey]: String(node[codeKey]), [nameKey]: String(node[nameKey] ?? '') });
        found = true;
      }
    }
    const children = Object.entries(node).filter(([key, child]) =>
      !key.endsWith('ClassCode') && !key.endsWith('ClassName') && (Array.isArray(child) || isObject(child)),
    );
    if (found) result.push({ ...current, leaf: children.length === 0 });
    children.forEach(([, child]) => walk(child, current));
  };
  walk(value, { leaf: false });
  return result;
}
