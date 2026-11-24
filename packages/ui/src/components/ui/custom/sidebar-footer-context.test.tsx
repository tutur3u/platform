import { afterEach, describe, expect, it } from 'vitest';
import { keepForAccountAnchor } from './sidebar-footer-context';

afterEach(() => {
  document.body.innerHTML = '';
});

function dismissal(target: EventTarget | null) {
  const event = { target, defaultPrevented: false, preventDefault() {} };
  event.preventDefault = () => {
    event.defaultPrevented = true;
  };
  return event;
}

function mount(html: string) {
  document.body.innerHTML = html;
  return {
    anchor: document.querySelector<HTMLElement>('#anchor'),
    menu: document.querySelector<HTMLElement>('#menu'),
    item: document.querySelector<HTMLElement>('#item'),
    page: document.querySelector<HTMLElement>('#page'),
  };
}

describe('keepForAccountAnchor', () => {
  it('keeps a popover open when focus returns to the avatar anchor', () => {
    const { anchor } = mount(
      '<button id="anchor"><span id="inner"></span></button><p id="page"></p>'
    );
    const event = dismissal(document.querySelector('#inner'));
    keepForAccountAnchor(event, { current: anchor });
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps a popover open when focus lands on the account menu while it closes', () => {
    // The menu that opened the popover stays on screen while it animates out;
    // focus reaching it is the hand-off, not an outside interaction.
    const { anchor, item } = mount(
      `<button id="anchor"></button>
       <div id="menu" role="menu" data-account-menu data-state="closed">
         <div id="item" role="menuitem"></div>
       </div>`
    );
    for (const target of [item, document.querySelector('#menu')]) {
      const event = dismissal(target);
      keepForAccountAnchor(event, { current: anchor });
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('dismisses for a press on the page or on a menu that is still open', () => {
    const { anchor, item, page } = mount(
      `<button id="anchor"></button>
       <p id="page"></p>
       <div id="menu" role="menu" data-state="open">
         <div id="item" role="menuitem"></div>
       </div>`
    );
    for (const target of [page, item]) {
      const event = dismissal(target);
      keepForAccountAnchor(event, { current: anchor });
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('does not treat another closing menu as the account menu', () => {
    const { anchor, item } = mount(
      `<button id="anchor"></button>
       <div id="menu" role="menu" data-state="closed">
         <div id="item" role="menuitem"></div>
       </div>`
    );
    const event = dismissal(item);
    keepForAccountAnchor(event, { current: anchor });
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the dismissal alone when no event target is a node', () => {
    const event = dismissal(null);
    keepForAccountAnchor(event, { current: null });
    expect(event.defaultPrevented).toBe(false);
  });
});
