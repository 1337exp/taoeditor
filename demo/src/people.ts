import type { MentionItem } from '@1337exp/taoeditor/vue/taoui';

/** A fake directory of people. The editor never sees it: the app answers `@` through the `mentions` function. */
export const PEOPLE: readonly (MentionItem & { id: string })[] = [
    { id: 'u1', label: 'Ann Lee', hint: 'ann' },
    { id: 'u2', label: 'Andy Park', hint: 'andy' },
    { id: 'u3', label: 'Bob Stone', hint: 'bob' },
    { id: 'u4', label: 'Carla Diaz', hint: 'carla' },
    { id: 'u5', label: 'Dmitri Volkov', hint: 'dima' },
    { id: 'u6', label: 'Elena Sokolova', hint: 'elena' },
];

/** Answers a little late, like a server would. */
export function searchPeople(query: string): Promise<MentionItem[]> {
    const q = query.toLowerCase();
    return new Promise((resolve) => {
        setTimeout(() => resolve(PEOPLE.filter((p) => p.label.toLowerCase().includes(q) || (p.hint ?? '').includes(q))), 120);
    });
}
