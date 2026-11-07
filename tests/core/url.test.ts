import { describe, expect, it } from 'vitest';
import { safeUrl } from '../../src/core';

describe('safeUrl', () => {
    it.each([
        ['https://666.io', 'https://666.io/'],
        ['  http://example.com/a?b=1#c  ', 'http://example.com/a?b=1#c'],
        ['HTTPS://EXAMPLE.com', 'https://example.com/'],
        ['https://пример.рф/путь', 'https://xn--e1afmkfd.xn--p1ai/%D0%BF%D1%83%D1%82%D1%8C'],
    ])('allows %s', (input, expected) => {
        expect(safeUrl(input)).toBe(expected);
    });

    it.each([
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'java\tscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:x',
        'file:///etc/passwd',
        'blob:https://a.com/x',
        '//evil.com',
        '/relative',
        'mailto:a@b.c',
        // these have a host, so only the protocol check stops them
        'ftp://example.com/file',
        'ws://example.com/socket',
        'ssh://git@example.com',
        'custom-app://open/thing',
        'https://user:pass@evil.com',
        'https://trusted.com@evil.com',
        'https://exa mple.com',
        'https://a.com/\u0000',
        'https://a.com/\nx',
        'https://',
        '',
        '   ',
        'https://a.com/' + 'x'.repeat(2100),
    ])('refuses %j', (input) => {
        expect(safeUrl(input)).toBeNull();
    });

    it.each([null, undefined, 42, {}, [], true])('refuses a non-string %s', (input) => {
        expect(safeUrl(input)).toBeNull();
    });
});
