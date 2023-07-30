# Azure DevOps WorkItems to GitHub Issues Migration

TypeScript script to migrate AzureDevOps work items to GitHub issues. Inspired by https://github.com/joshjohanning/ado_workitems_to_github_issues.

## Features

-   Migrate work item title and description or in case of a bug repro steps and system info
-   Migrate work item acceptance criteria
-   Migrate work item relations (child, related and predecessor) as a [tasklist](https://docs.github.com/en/issues/tracking-your-work-with-issues/about-tasklists)
-   Add a comment to the GitHub issue containing
    -   the URL to the Azure DevOps work item
    -   basic details (e.g. created by, created and more) in a collapsed details block
    -   adds the work item as json in a collapsed details block

## Usage

### Prerequisites

1. Install NodeJS
2. In the GitHub repository, the work items are migrated to, create a `label` for each work item type that is being migrated (i.e. Bug => `bug`). The labels are added to the GitHub issue to identity the work item type.
3. Checkout the repository and configure the parameters in the `.env` file

| Parameter          | Description                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADO_TOKEN`        | Azure DevOps personal access token with `read` permissions. `write` permissions are necessary, if a tag and comment should be added to the migrated Azure DevOps work item |
| `ADO_ORGANIZATION` | Azure DevOps organization to migrate from                                                                                                                                  |
| `ADO_PROJECT`      | Azure DevOps project to migrate from                                                                                                                                       |
| `GH_TOKEN`         | GitHub personal access token with permission to create issues                                                                                                              |
| `GH_ORGANIZATION`  | GitHub organization to migrate to                                                                                                                                          |
| `GH_REPOSITORY`    | GitHUb repository to migrate to                                                                                                                                            |

Example `.env`

```
# Azure DevOps
ADO_TOKEN=<ADO_TOKEN>
ADO_ORGANIZATION=example-org-ado
ADO_PROJECT=example-project
ADO_AREA_PATH=example-area-path

# GitHub
GH_TOKEN=<GH_TOKEN>
GH_ORGANIZATION=example-org-github
GH_REPOSITORY=exmaple-repository
```

### Run

#### NPM

`npm run dev`

#### PNPM

`pnpm run dev`

## Addiotinal information

-   Azure DevOps Rest API - Work Items - Get Work Item: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?tabs=HTTP#get-work-item

## Todo

-   [ ] Fix delete all issues (graphql mutation)
    -   https://github.com/orgs/community/discussions/39520
    -   https://docs.github.com/en/graphql/reference/mutations#deleteissue
-   [ ] Bug if the description is empty, the value in GitHub issue is "undefined"
-   [ ] add github workflow to trigger it from GitHub
-   [ ] Check if users can automatically assigned somehow
    -   Define a mapping table of ADO users to GitHub?
-   [ ] add configurations to migrate closed work items
    -   [ ] close the issue if it's closed on the Azure Devops side
-   [ ] Add log info output for different steps, so the user can follow what happened when and where
-   [ ] add tests
