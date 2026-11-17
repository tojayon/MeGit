type Plural = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
// Each language supplies its CLDR forms; validation checks required categories.
export type LocaleResource<T> = {
  [K in keyof T as K extends `${string}_${Plural}` ? never : K]: T[K] extends string
    ? string
    : LocaleResource<T[K]>;
} & {
  [K in keyof T as K extends `${infer Base}_other` ? `${Base}_${Plural}` : never]?: string;
};
