import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { Logger } from 'tslog'

import * as WorkItemTrackingInterfaces from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces'
import { AzureDevopsWorkItemManager } from './azure-devops-workitem-manager'
import { GitHubIssue } from './model/github-issue'
import { GitHubIssueManager } from './github-issue-manager'

/* You can ignore every log message from being processed until a certain severity. 
Default severities are: 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
*/
const log: Logger<any> = new Logger({ minLevel: 2 })
dotenv.config()
log.trace(process.env)

/**
 * SCRIPT CONFIGURATION
 */
const ado_org = process.env.ADO_ORGANIZATION
const ado_project = process.env.ADO_PROJECT
const ado_token = process.env.ADO_TOKEN
const ado_area_path = process.env.ADO_AREA_PATH

const github_org = process.env.GH_ORGANIZATION
const github_repository = process.env.GH_REPOSITORY
const gh_token = process.env.GH_TOKEN

const option_migrate_closed_workItems = String(process.env.OPT_MIGRATE_CLOSED_WORKITEMS).toLowerCase() === 'true'
const option_add_tag_migrated_to_github = String(process.env.OPT_ADD_TAG_MIGRATED_TO_GITHUB).toLowerCase() === 'true'
const DELETE_MIGRATED_GITHUB_ISSUES = false

async function run() {
    if (!ado_org || !ado_project || !ado_token || !ado_area_path) {
        throw new Error(
            `Azure DevOps inputs are not all defined: org=${ado_org} project=${ado_project} areaPath=${ado_area_path} or the token.`
        )
    }
    if (!github_org || !github_repository || !gh_token) {
        throw new Error(`GitHub inputs are not all defined: organization=${github_org} repository=${github_repository} or the token.`)
    }

    log.info(`Starting migration for...`)
    log.info(`  FROM Azure DevOps`)
    log.info(`      -> Organization=${ado_org}`)
    log.info(`      -> Project=${ado_project}`)
    log.info(`      -> AreaPath=${ado_area_path}`)
    log.info(`  TO GitHub`)
    log.info(`      -> Organization=${github_org}`)
    log.info(`      -> Repository=${github_repository}`)
    log.info(`  Options`)
    log.info(`      -> OPT_MIGRATE_CLOSED_WORKITEMS=${option_migrate_closed_workItems}`)
    log.info(`      -> OPT_ADD_TAG_MIGRATED_TO_GITHUB=${option_add_tag_migrated_to_github}`)

    const adoWorkItemManager = new AzureDevopsWorkItemManager(ado_org, ado_project, ado_token, log)
    const gitHubIssueManager = new GitHubIssueManager(github_org, github_repository, gh_token, log)

    /*
    ############
    DELETE ALL GITHUB ISSUES IN THE REPOSITORY -> CHANGE THE BOOLEAN VALUE
    ############
    */
    if (DELETE_MIGRATED_GITHUB_ISSUES) {
        await gitHubIssueManager.deleteAllIssues()
        throw new Error('Stopping after deleting all issues!')
    }

    const response = await adoWorkItemManager.queryByWiql(option_migrate_closed_workItems, ado_area_path)
    log.trace(response)

    const workItemToGitHubIssue = new Map<number, GitHubIssue>()
    const workItems = new Set<WorkItemTrackingInterfaces.WorkItem>()

    const workItemRefs = response.workItems
    if (!workItemRefs) {
        throw Error('Could not get Azure Devops WorkItems.')
    }
    for (const workItemRef of workItemRefs) {
        if (!workItemRef.id) {
            throw Error('Azure Devops WorkItem has no ID.')
        }

        const workItem = await adoWorkItemManager.getWorkItem(workItemRef.id)
        log.trace(workItem)

        /*
        Build up the issue body
        */
        const issue_title = adoWorkItemManager.getWorkItemTitle(workItem)
        const issue_label = adoWorkItemManager.getWorkItemType(workItem)
        log.info(`Migrating ${issue_label}: ${issue_title}`)

        const issue_description = adoWorkItemManager.generateIssueDescription(workItem)

        /*
        Build up the issue comment with the meta data 
        */
        let issue_comment = ''
        const workItemUrl = adoWorkItemManager.getWorkItemURL(workItem.id)
        issue_comment = workItemUrl

        // Add comments if available
        const workItemComments = await adoWorkItemManager.generateWorkItemComments(workItem, workItemRef)
        issue_comment += workItemComments

        // Create details table
        const workItemDetails = adoWorkItemManager.generateWorkItemDetails(workItem)

        log.trace(workItemDetails)
        issue_comment += `\n ${workItemDetails}`

        // Add Work Item JSON as details block
        const workItem_json = adoWorkItemManager.generateJsonDetails(workItem)
        issue_comment += workItem_json

        /*
        ############
        GitHub
        ############
        */

        const ghIssueResponse = await gitHubIssueManager.createIssue(issue_title, issue_description, issue_label)
        const ghIssue: GitHubIssue = {
            number: ghIssueResponse.data.number,
            html_url: ghIssueResponse.data.html_url,
            body: ghIssueResponse.data.body,
        }
        gitHubIssueManager.createComment(ghIssue, issue_comment)

        workItemToGitHubIssue.set(workItemRef.id, ghIssue)
        workItems.add(workItem)

        // Add tag "migrated-to-github" and comment to Azure DevOps work item
        if (option_add_tag_migrated_to_github) {
            log.info(`  Adding tag and comment to Azure DevOps work item ${adoWorkItemManager.getWorkItemTitle(workItem)}`)
            const comment = `Work item was migrated to GitHub: <a href="${ghIssue.html_url}">${ghIssue.html_url}</a>`
            await adoWorkItemManager.updateTag(workItemRef.id, 'add', 'migrated-to-github')
            await adoWorkItemManager.addComment(workItemRef.id, comment)
        }

        // Close GitHub issue in case work item was closed
        if (option_migrate_closed_workItems) {
            if (adoWorkItemManager.isClosed(workItem)) {
                log.info(`  Closing GitHub issue ${adoWorkItemManager.getWorkItemTitle(workItem)}`)
                gitHubIssueManager.closeIssue(ghIssue)
            }
        }
    }
    /*
    ############
    Add relations as tasklists
    ############
    */

    log.trace(workItemToGitHubIssue)

    log.info(`Migrating relations as tasklists for...`)
    for (const workItem of workItems) {
        if (!workItem.id) {
            throw new Error(`WorkItem is missing its ID:\n ${workItem})`)
        }

        log.info(`  -> ${adoWorkItemManager.getWorkItemTitle(workItem)}`)

        const idsOfRelatedChildrenWorkItems = adoWorkItemManager.getIdsOfRelatedWorkItems(workItem, 'Child')
        const tasklistChildren = gitHubIssueManager.generateTasklist(idsOfRelatedChildrenWorkItems, workItemToGitHubIssue, 'Children')
        const idsOfRelatedWorkItems = adoWorkItemManager.getIdsOfRelatedWorkItems(workItem, 'Related')
        const tasklistRelated = gitHubIssueManager.generateTasklist(idsOfRelatedWorkItems, workItemToGitHubIssue, 'Related')
        const idsOfPredecessorWorkItems = adoWorkItemManager.getIdsOfRelatedWorkItems(workItem, 'Predecessor')
        const predecessorTasklist = gitHubIssueManager.generateTasklist(idsOfPredecessorWorkItems, workItemToGitHubIssue, 'Predecessors')

        // Update Github issue
        const ghIssue = workItemToGitHubIssue.get(workItem.id)
        if (!ghIssue) {
            throw new Error(`WorkItem Id ${workItem.id} does not exist in workItem to GitHub issue mapping.`)
        }

        const issueBody = `${ghIssue?.body}${tasklistChildren}${tasklistRelated}${predecessorTasklist}`
        gitHubIssueManager.updateIssue(ghIssue, issueBody)
    }
}

run()
