import globals from 'globals';

// The rules the old .eslintrc had, in the flat config ESLint 9 and later read.
export default [
    {
        files: ['app/client/js/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'strict': ['error', 'function'],
            'no-undef': 'error',
            'no-console': 'off',
            'arrow-parens': ['error', 'always'],
        },
    },
];
