import { HookEngine } from './engine/HookEngine';
import { PreHookIntent } from './pre/preHookIntent';
import { PreHookScope } from './pre/PreHookScope';
// import { PostHookTrace } from './post/PostHookTrace';

// Create hook instances
const intentHook = new PreHookIntent();
const scopeHook = new PreHookScope();
// const traceHook = new PostHookTrace();

// Register with engine
const engine = HookEngine.getInstance();
engine.registerPreHook(intentHook);
engine.registerPreHook(scopeHook);
// engine.registerPostHook(traceHook);

export { engine, intentHook };