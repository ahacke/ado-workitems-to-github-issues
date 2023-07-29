import * as azdev from 'azure-devops-node-api'
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi'
import * as WorkItemTrackingInterfaces from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces'
import { Logger } from 'tslog'

/**
 * Manages Azure DevOps work items.
 */
export class AzureDevopsWorkItemManager {
    ado_org: string
    ado_project: string
    connection: azdev.WebApi
    witApi: IWorkItemTrackingApi | null = null
    log: Logger<any>

    constructor(ado_org: string, ado_project: string, ado_token: string, log: Logger<any>) {
        this.ado_org = ado_org
        this.ado_project = ado_project
        this.connection = this.initalizeConnection(ado_token)
        this.log = log
    }

    /**
     * Initalizes the Azure DevOps connection.
     * @param ado_token Azure DevOps access token
     * @returns Azure DevOps connection
     */
    initalizeConnection(ado_token: string) {
        const orgUrl = `https://dev.azure.com/${this.ado_org}`
        const authHandler = azdev.getPersonalAccessTokenHandler(ado_token)
        return new azdev.WebApi(orgUrl, authHandler)
    }

    /**
     * Gets the Azure DevOps WorkItemTrackingApi.
     * @returns Azure DevOps WorkItemTrackingApi
     */
    async getWitApi() {
        if (!this.witApi) {
            this.witApi = await this.connection.getWorkItemTrackingApi()
        }
        return this.witApi
    }

    /**
     * Queries Azure DevOps for work items.
     * @param ado_migrate_closed_workItems Migrate closed work items: true or false
     * @param ado_area_path Azure DevOps area path
     * @returns Azure DevOps work items query result
     */
    async queryByWiql(ado_migrate_closed_workItems: boolean, ado_area_path: string) {
        let closed_wiql = ''
        if (!ado_migrate_closed_workItems) {
            closed_wiql = `[State] <> 'Done' and [State] <> 'Closed' and [State] <> 'Resolved' and [State] <> 'Removed' and`
        }

        const wiql = `select [ID], [Title], [System.Tags] from workItems where ${closed_wiql} [System.AreaPath] UNDER '${ado_area_path}' and not [System.Tags]Contains 'copied-to-github' order by [ID]`

        const wiqlObj: WorkItemTrackingInterfaces.Wiql = {
            query: wiql,
        }
        const witApi = await this.getWitApi()
        return await witApi.queryByWiql(wiqlObj)
    }

    /**
     * Gets a work item from Azure DevOps.
     * @param workItemId Azure DevOps work item id
     * @returns  Azure DevOps work item
     */
    async getWorkItem(workItemId: number) {
        const witApi = await this.getWitApi()
        return witApi.getWorkItem(workItemId, undefined, undefined, 1)
    }

    /**
     * Gets work item type
     * @param workItem Azure DevOps work item
     * @returns Azure DevOps work item type
     */
    getWorkItemType(workItem: WorkItemTrackingInterfaces.WorkItem) {
        if (!workItem.fields) {
            throw new Error('WorkItem fields are undefined')
        }
        return workItem.fields['System.WorkItemType']
    }

    /**
     * Gets work item title
     * @param workItem Azure DevOps work item
     * @returns Azure DevOps work item title
     */
    getWorkItemTitle(workItem: WorkItemTrackingInterfaces.WorkItem) {
        if (!workItem.fields) {
            throw new Error('WorkItem fields are undefined')
        }
        return workItem.fields['System.Title']
    }

    /**
     * Generate work item description in markdown format.
     * @param workItem Azure DevOps work item
     * @returns Azure DevOps work item description in markdown format
     */
    generateIssueDescription(workItem: WorkItemTrackingInterfaces.WorkItem) {
        if (!workItem.fields) {
            throw new Error('WorkItem fields are undefined')
        }
        let issue_description = ''

        if (workItem.fields['System.WorkItemType'] === 'Bug') {
            if (workItem.fields['Microsoft.VSTS.TCM.ReproSteps']) {
                // $description += "## Repro Steps`n`n" + $reproSteps + "`n`n";
                issue_description += `## Repro Steps \n \n ${workItem.fields['Microsoft.VSTS.TCM.ReproSteps']} \n \n`
            }
            if (workItem.fields['Microsoft.VSTS.TCM.SystemInfo']) {
                issue_description += `## System Info \n \n ${workItem.fields['Microsoft.VSTS.TCM.SystemInfo']} \n \n`
            }
        } else {
            issue_description += workItem.fields['System.Description']
            if (workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
                issue_description += `## Acceptance Criteria\n \n ${workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria']} \n \n`
            } else {
                this.log.trace(`Story ${workItem.fields['System.Title']} has no acceptance criteria.`)
            }
        }
        return issue_description
    }

    /**
     * Generate work item url in markdown format.
     * @param workItemId Azure DevOps work item id
     * @returns Azure DevOps work item url in markdown format
     */
    getWorkItemURL(workItemId: number | undefined) {
        return `[Azure DevOps Work Item URL](https://dev.azure.com/${this.ado_org}/${this.ado_project}/_workitems/edit/${workItemId})`
    }

    /**
     * Generate work item id from url
     * @param url Azure DevOps work item url
     * @returns Azure DevOps work item id
     */
    getWorkItemIdFromURL(url: string) {
        return url.substring(url.lastIndexOf('/') + 1)
    }

    /**
     * Generate work item comments block in markdown format.
     * @param workItem Azure DevOps work item
     * @param workItemRef Azure DevOps work item reference
     * @returns Azure DevOps work item comments block in markdown format
     */
    async generateWorkItemComments(workItem: WorkItemTrackingInterfaces.WorkItem, workItemRef: any) {
        if (!workItem.fields) {
            throw new Error('WorkItem fields are undefined')
        }
        let workItemComments = ''
        if (workItem.fields['System.CommentCount'] > 0) {
            const witApi = await this.getWitApi()
            const comments = await witApi.getComments(this.ado_project, workItemRef.id)
            this.log.trace(comments)

            if (!comments.comments) {
                throw new Error('Azure Devops work item comments are undefined')
            }
            if (!comments.totalCount) {
                throw new Error('Azure Devops work item comment total count is undefined')
            }

            const workItemComments_metaData_start = '\n<details><summary>Work Item Comments</summary><p>\n\n'
            const workItemComments_metaData_end = '\n</p></details>'

            workItemComments = workItemComments_metaData_start

            let commentsProcessed = 0
            for (const comment of comments.comments) {
                commentsProcessed++

                let workItemComment = '| Created date | Created by | JSON URL | \n'
                workItemComment += '|---|---|---|\n'
                workItemComment += `| ${comment.createdDate} | ${comment.createdBy?.displayName} | [URL](${comment.url}) |\n\n`

                workItemComments += workItemComment
            }
            workItemComments += workItemComments_metaData_end

            if (commentsProcessed !== comments.totalCount) {
                throw new Error('Azure Devops work item total comment count differs from the processed comment count')
            }
        }
        return workItemComments
    }

    /**
     * Generate work item details block in markdown format.
     * @param workItem Azure DevOps work item
     * @returns Azure DevOps work item details block in markdown format
     */
    generateWorkItemDetails(workItem: WorkItemTrackingInterfaces.WorkItem) {
        if (!workItem.fields) {
            throw new Error('WorkItem fields are undefined')
        }
        const workItemDetails_metaData_start = '\n<details><summary>Work Item Details</summary><p>\n\n'
        const workItemDetails_metaData_end = '\n</p></details>'

        let workItemDetails_metaData =
            '| Created date | Created by | Changed date | Changed By | Assigned To | State | Type | Area Path | Iteration Path|\n'
        workItemDetails_metaData += '|---|---|---|---|---|---|---|---|---|\n'
        workItemDetails_metaData += `| ${workItem.fields['System.CreatedDate']} | ${workItem.fields['System.CreatedBy'].displayName} | ${workItem.fields['System.ChangedDate']} | ${workItem.fields['System.ChangedBy'].displayName}| ${workItem.fields['System.AssignedTo']?.displayName} | ${workItem.fields['System.State']} | ${workItem.fields['System.WorkItemType']} | ${workItem.fields['System.AreaPath']} | ${workItem.fields['System.IterationPath']} |`

        let workItemDetails = workItemDetails_metaData_start
        workItemDetails += workItemDetails_metaData
        workItemDetails += workItemDetails_metaData_end
        return workItemDetails
    }
    /**
     * Generate work item json block in markdown format.
     * @param workItem Azure DevOps work item
     * @returns Azure DevOps work item json block in markdown format
     */
    generateJsonDetails(workItem: WorkItemTrackingInterfaces.WorkItem) {
        const workItem_json_start = '\n<details><summary>Work Item JSON</summary><p>\n\n'
        const workItem_json_end = '\n\n</p></details>'
        let workItem_json = workItem_json_start
        workItem_json += `\`\`\`json\n${JSON.stringify(workItem, null, 2)}\n\`\`\``
        workItem_json += workItem_json_end
        return workItem_json
    }

    /**
     * Generate work item relations block in markdown format.
     * @param workItem  Azure DevOps work item
     * @param relationType  Azure DevOps work item relation type
     * @returns Azure DevOps work item relations block in markdown format
     */
    getIdsOfRelatedWorkItems(workItem: WorkItemTrackingInterfaces.WorkItem, relationType: string) {
        const relatedWorkItems = new Set<number>()
        if (!workItem.relations) {
            return relatedWorkItems
        }

        for (const workItemRelation of workItem.relations) {
            if (!workItemRelation.attributes || !workItemRelation.url) {
                throw new Error(
                    `WorkItem (id: ${workItem.id}) relation misses attributes ${workItemRelation.attributes} or url ${workItemRelation.url}`
                )
            }
            if (workItemRelation.attributes['name'] === relationType) {
                const workItemIdFromUrl = this.getWorkItemIdFromURL(workItemRelation.url)
                relatedWorkItems.add(+workItemIdFromUrl)
            }
        }
        return relatedWorkItems
    }

    async addComment(workItemId: number, commentText: string) {
        const witApi = await this.getWitApi()
        const comment = {
            text: commentText,
        }
        return witApi.addComment(comment, this.ado_project, workItemId)
    }

    /**
     * Updates a tag of a work item
     * @param workItemId Azure DevOps work item Id
     * @param tagText Text of the tag
     * @param operation The patch operation (e.g. add, remove, replace, etc.) https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-5.1&tabs=HTTP#operation
     * @returns
     */
    async updateTag(workItemId: number, operation: string, tagText: string) {
        const witApi = await this.getWitApi()
        const tag = {
            op: operation,
            path: '/fields/System.Tags',
            value: tagText,
        }
        return witApi.updateWorkItem(null, [tag], workItemId)
    }
}
