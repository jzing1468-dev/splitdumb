import { useEffect, useReducer, useMemo, useRef } from 'react';
import * as Y from 'yjs';

// Hook: observe a Yjs Map and re-render on any change (including deep)
export function useYjsMap(doc, name) {
  const map = doc.getMap(name);
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const handler = () => forceUpdate();
    map.observe(handler);
    return () => map.unobserve(handler);
  }, [map]);
  return map;
}

// Hook: observe a Yjs Array and re-render on any change
export function useYjsArray(doc, name) {
  const arr = doc.getArray(name);
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const handler = () => forceUpdate();
    arr.observe(handler);
    return () => arr.unobserve(handler);
  }, [arr]);
  return arr;
}

// Convert Yjs map values to plain JS objects (memoized by render count)
export function mapToPlain(ymap) {
  const result = {};
  ymap.forEach((val, key) => {
    result[key] = val;
  });
  return result;
}

// Convert Yjs array to plain JS array (memoized by render count)
export function arrayToPlain(yarr) {
  return yarr.toArray();
}