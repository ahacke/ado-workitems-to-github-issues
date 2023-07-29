/**
 * GitHub issue model
 */
export interface GitHubIssue {
    /**
     * GitHub issue number
     */
    number: number
    /**
     * URL in HTML format of the GitHub issue (e.g. https://github.com/myorg/myrepo/issue/23)
     */
    html_url: string
    /**
     * GitHub issue body
     */
    body: string | null | undefined
}
