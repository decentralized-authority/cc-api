import AWS from 'aws-sdk';

export class QueueTools {

  sqs: AWS.SQS;
  queueUrl: string;

  constructor(sqs: AWS.SQS, queueUrl: string) {
    this.sqs = sqs;
    this.queueUrl = queueUrl;
  }

  async sendMessageRaw(message: string): Promise<AWS.SQS.SendMessageResult> {
    const params = {
      MessageBody: message,
      QueueUrl: this.queueUrl,
    };
    return await this.sqs.sendMessage(params).promise();
  }

  async sendMessage(message: any): Promise<string> {
    const res = await this.sendMessageRaw(JSON.stringify(message));
    return res.MessageId || '';
  }

}

export class QueueManager {

  sqs: AWS.SQS;
  routingTablesChange: QueueTools;

  constructor(routingTablesChangeQueueUrl: string) {
    this.sqs = new AWS.SQS({
      apiVersion: '2012-11-05',
    });
    this.routingTablesChange = new QueueTools(this.sqs, routingTablesChangeQueueUrl);
  }

}
