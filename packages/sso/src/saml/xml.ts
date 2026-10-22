import {
  DOMImplementation,
  DOMParser,
  type Document,
  type Element,
  type Node,
  XMLSerializer,
} from '@xmldom/xmldom';
import { requireProtocol } from '../contracts';

export const MAX_XML_BYTES = 32_768;

export function parseXml(xml: string) {
  requireProtocol(Buffer.byteLength(xml) <= MAX_XML_BYTES, 'XML_TOO_LARGE');
  // Requests have no reason to contain DTDs, entities, comments, CDATA or PIs.
  requireProtocol(!/<!|<\?(?!xml\s)/i.test(xml), 'XML_DECLARATION');
  const doc = new DOMParser({
    onError: () => {
      throw new Error('SAML_XML_INVALID');
    },
  }).parseFromString(xml, 'application/xml');
  const ids = new Set<string>();
  let count = 0;
  function visit(node: Node, depth: number) {
    requireProtocol(depth <= 16 && ++count <= 256, 'XML_COMPLEXITY');
    if (node.nodeType === 1 && 'attributes' in node) {
      const element = node as Element;
      requireProtocol(element.attributes.length <= 24, 'XML_COMPLEXITY');
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes.item(i);
        if (attr && /^(id)$/i.test(attr.localName ?? attr.name)) {
          requireProtocol(!ids.has(attr.value), 'DUPLICATE_ID');
          ids.add(attr.value);
        }
      }
    }
    for (let n = node.firstChild; n; n = n.nextSibling) visit(n, depth + 1);
  }
  visit(doc, 0);
  return doc;
}

export function children(element: Element): Element[] {
  return Array.from(element.childNodes).filter(
    (n): n is Element => n.nodeType === 1
  );
}

export function one(
  element: Element,
  namespace: string,
  name: string
): Element {
  const found = children(element).filter(
    (n) => n.namespaceURI === namespace && n.localName === name
  );
  requireProtocol(found.length === 1 && found[0], 'XML_STRUCTURE');
  return found[0];
}

export function textOnly(element: Element): string {
  requireProtocol(children(element).length === 0, 'XML_STRUCTURE');
  return element.textContent ?? '';
}

export function restrictAttributes(element: Element, allowed: string[]): void {
  for (const attr of Array.from(element.attributes)) {
    if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
    requireProtocol(
      !attr.namespaceURI && allowed.includes(attr.name),
      'UNSUPPORTED_ATTRIBUTE'
    );
  }
}

export function newDocument(namespace: string, name: string) {
  return new DOMImplementation().createDocument(namespace, name, null);
}

export function documentRoot(doc: Document): Element {
  const root = doc.documentElement;
  requireProtocol(root, 'ROOT');
  return root;
}

export function append(
  parent: Element,
  namespace: string,
  name: string,
  attrs: Record<string, string> = {},
  text?: string
): Element {
  const doc = parent.ownerDocument;
  requireProtocol(doc, 'XML_DOCUMENT');
  const node = doc.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  if (text !== undefined) node.appendChild(doc.createTextNode(text));
  parent.appendChild(node);
  return node;
}

export function serialize(node: Node): string {
  return new XMLSerializer().serializeToString(node, {
    requireWellFormed: true,
  });
}
