import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Slow machines (a busy server) need more than the 1 second default to find things.
configure({ asyncUtilTimeout: 5000 })
