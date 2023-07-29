import { Octokit } from 'octokit'
import { Logger } from 'tslog'
import { GitHubIssue } from './model/github-issue'

/**
 * Manages GitHub issues.
 */
export class GitHubIssueManager {
    organization: string
    repository: string
    octokitClient: Octokit
    log: Logger<any>

    /**
     * Creates a new GitHubIssueManager.
     * @param organization GitHub organization
     * @param repository GitHub repository
     * @param gitHubToken GitHub access token
     * @param log Logger
     */
    constructor(organization: string, repository: string, gitHubToken: string, log: Logger<any>) {
        this.organization = organization
        this.repository = repository
        this.log = log
        this.octokitClient = new Octokit({ auth: gitHubToken, userAgent: 'ado-github-migrator' })
    }

    /**
     * Creates a GitHub issue.
     * @returns ReST response of the created issue
     */
    async createIssue(issue_title: any, issue_description: string, issue_label: any) {
        return await this.octokitClient.rest.issues.create({
            owner: this.organization,
            repo: this.repository,
            title: issue_title,
            body: issue_description,
            labels: [issue_label],
        })
    }

    /**
     * Updates a GitHub issue.
     * @param ghIssue The GitHub issue to update
     * @param issueBody The new body of the GitHub issue
     * @returns ReST response of the updated issue
     */
    async updateIssue(ghIssue: GitHubIssue, issueBody: string) {
        return await this.octokitClient.rest.issues.update({
            owner: this.organization,
            repo: this.repository,
            issue_number: ghIssue?.number,
            body: issueBody,
        })
    }
    /**
     * Creates a comment on a GitHub issue.
     * @param ghIssue The GitHub issue to comment on
     * @param issue_comment The comment to create
     * @returns ReST response of the created comment
     */
    async createComment(ghIssue: GitHubIssue, issue_comment: string) {
        return await this.octokitClient.rest.issues.createComment({
            owner: this.organization,
            repo: this.repository,
            issue_number: ghIssue.number,
            body: issue_comment,
        })
    }

    /**
     * Generates a GitHub tasklist in markdown format.
     * @param relatedWorkItems Workitems, part of the tasklist
     * @param workItemToGitHubIssue Map from workItem to GitHubIssue
     * @param tasklistTitle Title of the tasklist e.g. Children
     * @returns
     */
    generateTasklist(relatedWorkItems: Set<number>, workItemToGitHubIssue: Map<number, GitHubIssue>, tasklistTitle: string) {
        const tasklistStart = '\n\n```[tasklist]'
        const tasklistNamePrefix = '\n### ' // e.g. ### Children
        const tasklistEntryPrefix = '\n- [ ] ' // e.g. - [ ] https://github.com/myOrg/myRepo/issues/32
        const tasklistEnd = '\n```'

        let tasklist = ''
        if (relatedWorkItems.size > 0) {
            tasklist += tasklistStart
            tasklist += `${tasklistNamePrefix} ${tasklistTitle}`
            for (const relatedChildWorkItem of relatedWorkItems) {
                const relatedGitHubIssue = workItemToGitHubIssue.get(relatedChildWorkItem)

                tasklist += `${tasklistEntryPrefix}${relatedGitHubIssue?.html_url}`
            }
            tasklist += tasklistEnd
        }
        return tasklist
    }

    /**
     * Deletes all issues in the repository.
     */
    async deleteAllIssues() {
        const repositoryIssues = await this.octokitClient.rest.issues.listForRepo({
            owner: this.organization,
            repo: this.repository,
        })
        for (const repositoryIssue of repositoryIssues.data) {
            await this.octokitClient.graphql(`
                    mutation {
                        deleteIssue(input: {issueId: "${repositoryIssue.number}", clientMutationId: "issue ${repositoryIssue.number} delete"}) {
                        clientMutationId
                        }
                    }
                `)
        }
    }
}
