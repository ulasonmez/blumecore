import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeCustomerVideoUrl } from '../src/lib/customer-video-url';

test('accepts YouTube video links and an empty value for removal', () => {
    for (const url of ['https://www.youtube.com/watch?v=abc&t=2', 'https://youtu.be/abc', 'https://m.youtube.com/shorts/abc', 'https://youtube.com/live/abc']) {
        assert.equal(normalizeCustomerVideoUrl(` ${url} `), url);
    }
    assert.equal(normalizeCustomerVideoUrl('  '), '');
});

test('rejects non-video, unsafe and deceptive links', () => {
    for (const url of ['javascript:alert(1)', 'http://youtu.be/abc', 'https://youtube.com.evil.test/watch?v=abc', 'https://youtube.com/channel/abc', 'https://youtube.com/watch', 'https://user@youtube.com/watch?v=abc', 'not a url']) {
        assert.equal(normalizeCustomerVideoUrl(url), null);
    }
});
