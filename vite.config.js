const isGitHubPagesBuild = process.env.GITHUB_PAGES === 'true' && !process.env.VERCEL;

export default {
  base: isGitHubPagesBuild ? '/YakuExpress/' : '/',
  optimizeDeps: {
    exclude: ['face-api.js'],
  },
};
