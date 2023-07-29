module.exports = {
    roots: ['<rootDir>'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    modulePathIgnorePatterns: ['<rootDir>/__test__/__fixtures__', '<rootDir>/node_modules', '<rootDir>/dist'],
    preset: 'ts-jest',
    clearMocks: true,
}
