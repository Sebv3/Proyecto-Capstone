import assert from 'node:assert/strict';
import test from 'node:test';
import { readableColors, textLayout } from '../src/services/accessibility.ts';

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('secondary text meets AA contrast on cards, pages and selected pale backgrounds', () => {
  for (const background of ['#FFFFFF', '#F3F6F4', '#F3F6F5', '#F5F7F6', '#E4F3EB']) {
    assert.ok(contrast(readableColors.secondary, background) >= 4.5, background);
  }
  assert.ok(contrast(readableColors.onPrimary, readableColors.primary) >= 4.5);
  assert.ok(contrast(readableColors.primary, '#E4F3EB') >= 4.5);
});

test('large text and narrow screens stack the service participant summary', () => {
  assert.equal(textLayout(480, 1).stacked, false);
  for (const [width, scale] of [[320, 1], [390, 1], [390, 1.3], [390, 2], [1024, 2]]) {
    assert.equal(textLayout(width, scale).stacked, true);
  }
});

test('calendar cells, timeline numbers and navigation grow through and beyond 200 percent', () => {
  let previous = textLayout(390, 1);
  for (const scale of [1.3, 1.5, 2, 3]) {
    const current = textLayout(390, scale);
    assert.ok(current.stepSize >= 24 * scale);
    assert.ok(current.calendarCellHeight >= 26 * scale);
    assert.ok(current.tabBarHeight >= previous.tabBarHeight);
    assert.ok(current.tabBarHeight >= 40 + 18 * scale);
    previous = current;
  }
  assert.ok(textLayout(390, 2).tabBarHeight >= 148);
  assert.ok(textLayout(320, 2).tabBarHeight >= 184);
});
