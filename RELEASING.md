# Releasing

This package uses npm trusted publishing with GitHub Actions. The workflow stages
new versions on npm, but does not make them live. A maintainer must review and
approve the staged package on npm with 2FA.

## One-time setup

- In npm package settings, configure a Trusted Publisher for `b2m9/reversible`.
- Set the workflow filename to `publish.yml`.
- Set the environment name to `npm-publish`.
- Allow only `npm stage publish`.
- In npm publishing access, require two-factor authentication and disallow
  tokens.
- Revoke any npm automation tokens for this package.
- In GitHub, create the `npm-publish` environment and add a required reviewer if
  available.
- Protect `main`.
- Add a `v*` tag ruleset that restricts creation to release maintainers and
  prevents deletion and force updates.
- Require owner review for `.github/workflows/**` changes if branch protection
  and CODEOWNERS are configured.

## Release checklist

1. Make sure `main` is green and contains the release commit.
2. Bump `package.json` to the next version.
3. Run:

   ```sh
   vp install
   vp check
   vp test run
   vp pack
   vp dlx publint
   ```

4. Commit the version bump.
5. Create and push a matching tag, for example `v0.2.0`.
6. Publish a GitHub Release for that tag.
7. Wait for the `Publish` workflow to stage the package on npm.
8. Review the staged package on npm.
9. Approve the staged package with npm 2FA.

## Reviewing a staged package

Use npmjs.com, or inspect it from the CLI:

```sh
npm stage list @b2m9/reversible
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

The workflow requires the GitHub Release tag to match the package version exactly:
`package.json` version `0.2.0` must be released from tag `v0.2.0`.
